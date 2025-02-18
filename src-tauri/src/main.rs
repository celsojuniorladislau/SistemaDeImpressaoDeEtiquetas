#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusb::{Context, DeviceHandle, UsbContext};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use once_cell::sync::Lazy;

// Constantes da Argox OS-2140
const ARGOX_VID: u16 = 0x1CBE;
const ARGOX_PID: u16 = 0x0002;
const TIMEOUT: Duration = Duration::from_secs(1);

// Estruturas de dados
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<i64>,
    name: String,
    name_short: String,
    code: String,
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
            width: 400,     // 50mm * 8 dots
            height: 240,    // 30mm * 8 dots
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

        let (device, _device_desc) = context
            .devices()
            .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?
            .iter()
            .find(|device| {
                device
                    .device_descriptor()
                    .map(|desc| desc.vendor_id() == ARGOX_VID && desc.product_id() == ARGOX_PID)
                    .unwrap_or(false)
            })
            .and_then(|device| {
                device
                    .device_descriptor()
                    .map(|desc| (device, desc))
                    .ok()
            })
            .ok_or("Impressora Argox OS-2140 não encontrada")?;

        let handle = device
            .open()
            .map_err(|e| format!("Erro ao abrir dispositivo: {}", e))?;

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

        handle
            .claim_interface(interface_desc.interface_number())
            .map_err(|e| format!("Erro ao configurar interface: {}", e))?;

        let mut endpoint_out = None;
        let mut endpoint_in = None;

        for endpoint_desc in interface_desc.endpoint_descriptors() {
            match endpoint_desc.direction() {
                rusb::Direction::Out => endpoint_out = Some(endpoint_desc.address()),
                rusb::Direction::In => endpoint_in = Some(endpoint_desc.address()),
            }
        }

        let endpoint_out = endpoint_out.ok_or("Endpoint de saída não encontrado")?;
        let endpoint_in = endpoint_in.ok_or("Endpoint de entrada não encontrado")?;

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
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            description TEXT DEFAULT '',
            name_short TEXT DEFAULT '',
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

    // Adiciona tabela de configurações da impressora
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

// Adicione estas funções auxiliares antes dos comandos Tauri:
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
    // Primeiro, tentamos obter o maior código existente
    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT code FROM products ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    );

    match result {
        Ok(Some(last_code)) => {
            // Extrai os 3 dígitos de sequência (posições 9, 10 e 11 do código)
            if last_code.len() >= 12 {
                let sequence = &last_code[9..12];
                let next_seq = sequence.parse::<i32>().unwrap_or(0) + 1;
                if next_seq > 999 {
                    return Err("Limite de sequência atingido".to_string());
                }
                Ok(next_seq)
            } else {
                Ok(1)
            }
        }
        _ => Ok(1), // Começa do 1 se não houver códigos anteriores
    }
}

fn generate_barcode() -> Result<String, String> {
    let conn = Connection::open("products.db").map_err(|e| e.to_string())?;
    
    let sequence = get_next_sequence(&conn)?;
    let prefix = "789846581";
    
    // Formata a sequência com zeros à esquerda
    let sequence_str = format!("{:03}", sequence);
    
    let code_without_check = format!("{}{}", prefix, sequence_str);
    let check_digit = calculate_ean13_check_digit(&code_without_check)?;
    
    Ok(format!("{}{}", code_without_check, check_digit))
}

#[tauri::command]
fn create_product(mut product: Product, db: State<DbConnection>) -> Result<Product, String> {
    let conn = db.0.lock().unwrap();
    
    // Gera o código de barras
    let barcode = generate_barcode()?;
    product.code = barcode;

    conn.execute(
        "INSERT INTO products (name, name_short, code, description) VALUES (?, ?, ?, ?)",
        params![&product.name, &product.name_short, &product.code, &product.description],
    ).map_err(|e| e.to_string())?;

    // Retorna o produto com o código gerado
    Ok(product)
}

#[tauri::command]
fn get_products(db: State<DbConnection>) -> Result<Vec<Product>, String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, name_short, code, description, created_at, updated_at FROM products")
        .map_err(|e| e.to_string())?;

    let products = stmt
        .query_map([], |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                name_short: row.get(2)?,
                code: row.get(3)?,
                description: Some(row.get::<_, String>(4)?),
                created_at: Some(row.get::<_, String>(5)?),
                updated_at: Some(row.get::<_, String>(6)?),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for product in products {
        result.push(product.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
fn update_product(id: i64, product: Product, db: State<DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    match conn.execute(
        "UPDATE products SET name = ?, name_short = ?, code = ?, description = ? WHERE id = ?",
        params![&product.name, &product.name_short, &product.code, &product.description, id],
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
async fn print_label(product: Product, _config: PrinterConfig) -> Result<(), String> {
    let printer_guard = PRINTER.lock().unwrap();
    
    if let Some(printer) = &*printer_guard {
        // Formata o texto para impressão
        let label_text = format!("{}\n{}", product.name_short, product.code);
        printer.print_label(&label_text)?;

        // Salva o trabalho de impressão no banco de dados

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
    
    // Remove configurações existentes
    conn.execute("DELETE FROM printer_settings", [])
        .map_err(|e| e.to_string())?;
    
    // Insere as novas configurações
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
            if desc.vendor_id() == ARGOX_VID && desc.product_id() == ARGOX_PID {
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


fn main() {
    tauri::Builder::default()
        .manage(setup_database())
        .invoke_handler(tauri::generate_handler![
            create_product,
            get_products,
            update_product,
            delete_product,
            print_label,
            get_print_history,
            save_printer_settings,
            get_printer_settings,
            connect_printer,
            print_test,
            list_printers,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

