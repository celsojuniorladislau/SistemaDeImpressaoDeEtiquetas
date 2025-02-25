#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusb::{Context, DeviceHandle, UsbContext};
use rusqlite::OptionalExtension;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use once_cell::sync::Lazy;

// Constantes da Argox OS-2140
const ARGOX_VID: u16 = 0x1664;  // ID do fabricante Argox
const ARGOX_PID: u16 = 0x013B;  // ID principal do modelo OS-2140
const ARGOX_PID_ALT: u16 = 0x015B;  // ID alternativo do modelo OS-2140
const TIMEOUT: Duration = Duration::from_secs(1);

// Estruturas de dados
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<i64>,
    product_code: String,
    name: String,
    name_short: String,
    barcode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PrintJob {
    id: i64,
    product_id: i64,
    product_name: String,
    product_code: String,
    created_at: String,
    status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterConfig {
    darkness: u8,      // Densidade de impressão (1-15)
    width: u32,        // Largura em dots (8 dots = 1mm)
    height: u32,       // Altura em dots
    speed: u8,         // Velocidade (1-4)
}

impl Default for PrinterConfig {
    fn default() -> Self {
        Self {
            darkness: 8,    // Densidade média
            width: 840,     // 105mm * 8 dots (3 etiquetas de 33mm + 2 espaços de 2mm)
            height: 176,    // 22mm * 8 dots
            speed: 2,       // Velocidade média
        }
    }
}

// Wrapper para o banco de dados
struct DbConnection(Arc<Mutex<Connection>>);

// Estrutura para impressora USB
pub struct UsbPrinter {
    handle: DeviceHandle<Context>,
    endpoint_out: u8,
    endpoint_in: u8,
    config: PrinterConfig,
}

impl UsbPrinter {
    fn new(config: PrinterConfig) -> Result<Self, String> {
        let context = Context::new()
            .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;

        println!("Procurando impressora Argox OS-2140...");
        println!("VID: {:04x}, PID: {:04x} ou {:04x}", ARGOX_VID, ARGOX_PID, ARGOX_PID_ALT);

        let (device, device_desc) = context
            .devices()
            .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?
            .iter()
            .find(|device| {
                device
                    .device_descriptor()
                    .map(|desc| {
                        desc.vendor_id() == ARGOX_VID && 
                        (desc.product_id() == ARGOX_PID || desc.product_id() == ARGOX_PID_ALT)
                    })
                    .unwrap_or(false)
            })
            .and_then(|device| {
                device
                    .device_descriptor()
                    .map(|desc| (device, desc))
                    .ok()
            })
            .ok_or("Impressora Argox OS-2140 não encontrada")?;

        println!("Impressora encontrada! PID: {:04x}", device_desc.product_id());

        let handle = device
            .open()
            .map_err(|e| format!("Erro ao abrir dispositivo: {}", e))?;

        println!("Conexão aberta. Resetando dispositivo...");

        handle
            .reset()
            .map_err(|e| format!("Erro ao resetar dispositivo: {}", e))?;

        let config_desc = device
            .config_descriptor(0)
            .map_err(|e| format!("Erro ao ler configuração: {}", e))?;

        let interface = config_desc
            .interfaces()
            .next()
            .ok_or("Interface não encontrada")?;

        let interface_desc = interface
            .descriptors()
            .next()
            .ok_or("Descritor de interface não encontrado")?;

        println!("Interface encontrada. Número: {}", interface_desc.interface_number());

        handle
            .claim_interface(interface_desc.interface_number())
            .map_err(|e| format!("Erro ao configurar interface: {}", e))?;

        let mut endpoint_out = None;
        let mut endpoint_in = None;

        for endpoint_desc in interface_desc.endpoint_descriptors() {
            match endpoint_desc.direction() {
                rusb::Direction::Out => {
                    endpoint_out = Some(endpoint_desc.address());
                    println!("Endpoint OUT encontrado: {:02x}", endpoint_desc.address());
                },
                rusb::Direction::In => {
                    endpoint_in = Some(endpoint_desc.address());
                    println!("Endpoint IN encontrado: {:02x}", endpoint_desc.address());
                },
            }
        }

        let endpoint_out = endpoint_out.ok_or("Endpoint de saída não encontrado")?;
        let endpoint_in = endpoint_in.ok_or("Endpoint de entrada não encontrado")?;

        println!("Endpoints configurados. Criando instância da impressora...");

        Ok(UsbPrinter {
            handle,
            endpoint_out,
            endpoint_in,
            config,
        })
    }

    fn write(&self, data: &[u8]) -> Result<usize, String> {
        self.handle
            .write_bulk(self.endpoint_out, data, TIMEOUT)
            .map_err(|e| format!("Erro ao enviar dados: {}", e))
    }

    fn read(&self, buffer: &mut [u8]) -> Result<usize, String> {
        self.handle
            .read_bulk(self.endpoint_in, buffer, TIMEOUT)
            .map_err(|e| format!("Erro ao ler dados: {}", e))
    }

    fn print_label(&self, text: &str) -> Result<(), String> {
        let commands = vec![
            format!("Q{},24\r\n", self.config.height),  // Altura
            format!("q{}\r\n", self.config.width),      // Largura
            format!("S{}\r\n", self.config.speed),      // Velocidade
            format!("D{}\r\n", self.config.darkness),   // Densidade
            "ZT\r\n".to_string(),                      // Limpa buffer
            format!("A50,50,0,3,1,1,N,\"{}\"\r\n", text), // Texto
            "P1\r\n".to_string(),                      // Imprime
        ];

        for cmd in commands {
            self.write(cmd.as_bytes())?;
        }

        Ok(())
    }

    fn test_connection(&self) -> Result<(), String> {
        self.write(b"~H\r\n")?;
        
        let mut buffer = [0u8; 32];
        let read = self.read(&mut buffer)?;
        
        if read > 0 {
            Ok(())
        } else {
            Err("Impressora não respondeu".to_string())
        }
    }
}

// Estado global da impressora
static PRINTER: Lazy<Mutex<Option<UsbPrinter>>> = Lazy::new(|| Mutex::new(None));

fn setup_database() -> DbConnection {
    let conn = Connection::open("products.db").expect("failed to open database");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_code TEXT NOT NULL,
            name TEXT NOT NULL,
            name_short TEXT NOT NULL,
            barcode TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .expect("failed to create products table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS print_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY(product_id) REFERENCES products(id)
        )",
        [],
    )
    .expect("failed to create print_jobs table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS printer_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            darkness INTEGER NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            speed INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .expect("failed to create printer_settings table");

    DbConnection(Arc::new(Mutex::new(conn)))
}

fn calculate_ean13_check_digit(code: &str) -> Result<char, String> {
    if code.len() != 12 {
        return Err("Código deve ter 12 dígitos para cálculo do EAN-13".to_string());
    }

    let mut sum = 0;
    for (i, c) in code.chars().enumerate() {
        let digit = c.to_digit(10).ok_or("Código inválido")?;
        sum += digit * if i % 2 == 0 { 1 } else { 3 };
    }

    let check_digit = (10 - (sum % 10)) % 10;
    Ok(char::from_digit(check_digit, 10).unwrap())
}

fn get_next_sequence(conn: &Connection) -> Result<i32, String> {
    println!("Buscando última sequência...");

    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT barcode FROM products ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    );

    let next_seq = match result {
        Ok(Some(last_barcode)) => {
            println!("Último código de barras encontrado: {}", last_barcode);
            if last_barcode.len() >= 12 {
                let sequence = &last_barcode[9..12];
                println!("Sequência extraída: {}", sequence);
                let current_seq = sequence.parse::<i32>().unwrap_or(0);
                let next = current_seq + 1;
                if next > 999 {
                    return Err("Limite de sequência atingido".to_string());
                }
                next
            } else {
                println!("Código de barras inválido, iniciando do 1");
                1
            }
        }
        _ => {
            println!("Nenhum código anterior, iniciando do 1");
            1
        }
    };

    println!("Próxima sequência: {}", next_seq);
    Ok(next_seq)
}

fn generate_barcode(conn: &Connection) -> Result<String, String> {
    let sequence = get_next_sequence(conn)?;
    let prefix = "789846581";
    
    let sequence_str = format!("{:03}", sequence);
    println!("Gerando código de barras - Prefixo: {}, Sequência: {}", prefix, sequence_str);
    
    let code_without_check = format!("{}{}", prefix, sequence_str);
    let check_digit = calculate_ean13_check_digit(&code_without_check)?;
    
    let final_code = format!("{}{}", code_without_check, check_digit);
    println!("Código de barras gerado: {}", final_code);
    
    Ok(final_code)
}

fn is_barcode_unique(conn: &Connection, barcode: &str) -> Result<bool, String> {
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE barcode = ?",
            params![barcode],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count == 0)
}

fn validate_product_code(product_code: &str) -> Result<(), String> {
    if product_code.trim().is_empty() {
        return Err("Código do produto não pode estar vazio".to_string());
    }
    if product_code.len() > 4 {
        return Err("Código do produto não pode ter mais de 4 digitos".to_string());
    }
    Ok(())
}

fn is_product_code_unique(conn: &Connection, product_code: &str) -> Result<bool, String> {
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE product_code = ?",
            params![product_code],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count == 0)
}

#[tauri::command]
fn create_product(mut product: Product, db: State<DbConnection>) -> Result<Product, String> {
    // Validar código do produto
    validate_product_code(&product.product_code)?;

    let mut conn = db.0.lock().unwrap();

    // Verificar se o código do produto já existe
    if !is_product_code_unique(&conn, &product.product_code)? {
        return Err("Código do produto já existe".to_string());
    }
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Gera o código de barras
    let barcode = generate_barcode(&tx)?;
    product.barcode = barcode;

    // Insere o produto dentro da mesma transação
    tx.execute(
        "INSERT INTO products (product_code, name, name_short, barcode, description) VALUES (?, ?, ?, ?, ?)",
        params![
            &product.product_code,
            &product.name,
            &product.name_short,
            &product.barcode,
            &product.description
        ],
    ).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid();
    product.id = Some(id);
    
    let now = chrono::Local::now().to_string();
    product.created_at = Some(now.clone());
    product.updated_at = Some(now);

    // Commit da transação
    tx.commit().map_err(|e| e.to_string())?;

    Ok(product)
}

#[tauri::command]
fn get_products(db: State<DbConnection>) -> Result<Vec<Product>, String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, product_code, name, name_short, barcode, description, created_at, updated_at FROM products")
        .map_err(|e| e.to_string())?;

    let products = stmt
        .query_map([], |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                product_code: row.get(1)?,
                name: row.get(2)?,
                name_short: row.get(3)?,
                barcode: row.get(4)?,
                description: Some(row.get::<_, String>(5)?),
                created_at: Some(row.get::<_, String>(6)?),
                updated_at: Some(row.get::<_, String>(7)?),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for product in products {
        result.push(product.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// Adicione esta função para verificar a sequência atual
#[tauri::command]
fn get_current_sequence(db: State<DbConnection>) -> Result<i32, String> {
    let conn = db.0.lock().unwrap();
    
    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT barcode FROM products ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    );

    match result {
        Ok(Some(last_barcode)) => {
            if last_barcode.len() >= 12 {
                let sequence = &last_barcode[9..12];
                Ok(sequence.parse::<i32>().unwrap_or(0))
            } else {
                Ok(0)
            }
        }
        _ => Ok(0)
    }
}

#[tauri::command]
fn update_product(id: i64, mut product: Product, db: State<DbConnection>) -> Result<Product, String> {
    // Adiciona log para debug
    println!("Tentando atualizar produto ID: {}", id);
    println!("Dados recebidos: {:?}", product);

    // Validar código do produto
    validate_product_code(&product.product_code)?;
    
    let mut conn = db.0.lock().unwrap();
    
    // Primeiro, verifica se o produto existe
    let existing_product: Option<Product> = conn.query_row(
        "SELECT id, product_code, name, name_short, barcode, description, created_at, updated_at 
         FROM products WHERE id = ?",
        params![id],
        |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                product_code: row.get(1)?,
                name: row.get(2)?,
                name_short: row.get(3)?,
                barcode: row.get(4)?,
                description: Some(row.get(5)?),
                created_at: Some(row.get(6)?),
                updated_at: Some(row.get(7)?),
            })
        },
    ).optional().map_err(|e| e.to_string())?;

    let existing_product = existing_product.ok_or("Produto não encontrado")?;
    
    // Verificar se o código do produto já existe (excluindo o próprio produto)
    if !is_product_code_unique(&conn, &product.product_code)? {
        return Err("Já existe outro produto cadastrado com este código".to_string());
    }

    // Iniciar transação
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Manter o código de barras original
    product.barcode = existing_product.barcode;
    
    // Atualizar o produto
    tx.execute(
        "UPDATE products SET 
            name = ?, 
            name_short = ?, 
            product_code = ?, 
            description = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
        params![
            &product.name,
            &product.name_short,
            &product.product_code,
            &product.description,
            id
        ],
    ).map_err(|e| e.to_string())?;

    // Commit da transação
    tx.commit().map_err(|e| e.to_string())?;

    // Buscar o produto atualizado
    let updated_product: Product = conn.query_row(
        "SELECT id, product_code, name, name_short, barcode, description, created_at, updated_at 
         FROM products WHERE id = ?",
        params![id],
        |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                product_code: row.get(1)?,
                name: row.get(2)?,
                name_short: row.get(3)?,
                barcode: row.get(4)?,
                description: Some(row.get(5)?),
                created_at: Some(row.get(6)?),
                updated_at: Some(row.get(7)?),
            })
        },
    ).map_err(|e| e.to_string())?;

    println!("Produto atualizado com sucesso: {:?}", updated_product);
    Ok(updated_product)
}

#[tauri::command]
fn delete_product(id: i64, db: State<DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    match conn.execute("DELETE FROM products WHERE id = ?", params![id]) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn print_label_batch(products: Vec<Option<Product>>, _config: PrinterConfig) -> Result<(), String> {
    let printer_guard = PRINTER.lock().unwrap();
    
    if let Some(printer) = &*printer_guard {
        // Configurações para 3 etiquetas lado a lado
        let mut commands = vec![
            "ZT\r\n".to_string(),                      // Limpa buffer
            format!("Q{},24\r\n", printer.config.height), // Altura (22mm = 176 dots)
            format!("q{}\r\n", printer.config.width),   // Largura total (105mm = 840 dots)
            format!("S{}\r\n", printer.config.speed),   // Velocidade
            format!("D{}\r\n", printer.config.darkness), // Densidade
        ];

        // Posições X para cada etiqueta
        let x_positions = [50, 314, 578];

        // Adiciona comandos para cada etiqueta
        for (index, product) in products.iter().enumerate() {
            if let Some(product) = product {
                let x = x_positions[index];
                commands.extend(vec![
                    format!("A{},24,0,3,1,1,N,\"ESTRELA METAIS\"\r\n", x),
                    format!("A{},48,0,3,1,1,N,\"{}\"\r\n", x, product.name_short),
                    format!("A{},72,0,3,1,1,N,\"{}\"\r\n", x, product.product_code),
                    format!("B{},96,0,1,2,2,60,B,\"{}\"\r\n", x, product.barcode),
                ]);
            }
        }

        commands.push("P1\r\n".to_string());  // Imprime

        for cmd in commands {
            printer.write(cmd.as_bytes())?;
        }

        Ok(())
    } else {
        Err("Impressora não conectada".to_string())
    }
}

#[tauri::command]
fn get_print_history(db: State<DbConnection>) -> Result<Vec<PrintJob>, String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, product_id, product_name, product_code, created_at, status FROM print_jobs ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let jobs = stmt
        .query_map([], |row| {
            Ok(PrintJob {
                id: row.get(0)?,
                product_id: row.get(1)?,
                product_name: row.get(2)?,
                product_code: row.get(3)?,
                created_at: row.get(4)?,
                status: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for job in jobs {
        result.push(job.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
async fn print_test() -> Result<(), String> {
    let printer_guard = PRINTER.lock().unwrap();
    
    if let Some(printer) = &*printer_guard {
        printer.print_label("Teste de Impressão")?;
        Ok(())
    } else {
        Err("Impressora não conectada".to_string())
    }
}

#[tauri::command]
async fn save_printer_settings(config: PrinterConfig, db: State<'_, DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    
    conn.execute("DELETE FROM printer_settings", [])
        .map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO printer_settings (
            darkness, width, height, speed
        ) VALUES (?, ?, ?, ?)",
        params![
            config.darkness,
            config.width,
            config.height,
            config.speed,
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn get_printer_settings(db: State<'_, DbConnection>) -> Result<Option<PrinterConfig>, String> {
    let conn = db.0.lock().unwrap();
    
    let result = conn.query_row(
        "SELECT darkness, width, height, speed FROM printer_settings LIMIT 1",
        [],
        |row| {
            Ok(PrinterConfig {
                darkness: row.get(0)?,
                width: row.get(1)?,
                height: row.get(2)?,
                speed: row.get(3)?,
            })
        },
    );
    
    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn connect_printer(config: PrinterConfig) -> Result<(), String> {
    let printer = UsbPrinter::new(config)?;
    printer.test_connection()?;
    
    let mut printer_guard = PRINTER.lock().unwrap();
    *printer_guard = Some(printer);
    
    Ok(())
}

#[tauri::command]
async fn list_printers() -> Result<Vec<String>, String> {
    let context = Context::new()
        .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;

    let devices = context
        .devices()
        .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?;

    let mut printers = Vec::new();

    for device in devices.iter() {
        if let Ok(desc) = device.device_descriptor() {
            if desc.vendor_id() == ARGOX_VID && 
               (desc.product_id() == ARGOX_PID || desc.product_id() == ARGOX_PID_ALT) {
                if let Ok(handle) = device.open() {
                    if let Ok(product) = handle.read_product_string_ascii(&desc) {
                        printers.push(product);
                    }
                }
            }
        }
    }

    Ok(printers)
}

#[tauri::command]
fn get_product(id: i64, db: State<DbConnection>) -> Result<Product, String> {
    let conn = db.0.lock().unwrap();
    
    conn.query_row(
        "SELECT id, product_code, name, name_short, barcode, description, created_at, updated_at 
         FROM products WHERE id = ?",
        params![id],
        |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                product_code: row.get(1)?,
                name: row.get(2)?,
                name_short: row.get(3)?,
                barcode: row.get(4)?,
                description: Some(row.get(5)?),
                created_at: Some(row.get(6)?),
                updated_at: Some(row.get(7)?),
            })
        },
    ).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(setup_database())
        .invoke_handler(tauri::generate_handler![
            create_product,
            get_products,
            get_product,
            update_product,
            delete_product,
            print_label_batch,
            get_print_history,
            save_printer_settings,
            get_printer_settings,
            connect_printer,
            print_test,
            list_printers,
            get_current_sequence,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}