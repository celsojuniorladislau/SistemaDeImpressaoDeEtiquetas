#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use serialport::SerialPort;
use std::time::Duration;
use std::io::Write;

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

// Wrapper para o banco de dados
struct DbConnection(Arc<Mutex<Connection>>);

// Estrutura para impressora PPLA
struct PPLAPrinter {
    port: Option<Box<dyn SerialPort>>,
}

impl PPLAPrinter {
    fn new() -> Self {
        Self { port: None }
    }

    fn connect(&mut self, port_name: &str, baud_rate: i32) -> Result<(), String> {
        let port = serialport::new(port_name, baud_rate as u32)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Erro ao conectar à impressora: {}", e))?;

        self.port = Some(port);
        Ok(())
    }

    fn print_label(&mut self, product: &Product, settings: &PrinterSettings) -> Result<(), String> {
        let port = self.port.as_mut()
            .ok_or_else(|| "Impressora não conectada".to_string())?;

        // Criamos as strings formatadas primeiro
        let name_cmd = format!("A50,10,0,3,1,1,N,\"{}\"\r\n", product.name_short);
        let code_cmd = format!("A50,50,0,2,1,1,N,\"{}\"\r\n", product.code);

        // Agora usamos as strings criadas com .to_string() para os literais
        let commands = vec![
            format!("Q{},24\r\n", settings.height * 8),  // Define tamanho da etiqueta
            format!("q{}\r\n", settings.width * 8),      // Define largura
            format!("S{}\r\n", settings.speed),          // Velocidade
            format!("D{}\r\n", settings.density),        // Densidade
            "ZT\r\n".to_string(),                       // Limpa buffer
            name_cmd,                                    // Nome curto
            code_cmd,                                    // Código
            "P1\r\n".to_string(),                       // Imprime 1 etiqueta
        ];

        for cmd in commands {
            port.write_all(cmd.as_bytes())
                .map_err(|e| format!("Erro ao enviar comando: {}", e))?;
        }

        Ok(())
    }
}

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

    // Add templates table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS label_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            font_size INTEGER NOT NULL,
            show_price BOOLEAN NOT NULL DEFAULT 0,
            show_code BOOLEAN NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .expect("failed to create label_templates table");

    // Adiciona tabela de configurações da impressora
    conn.execute(
        "CREATE TABLE IF NOT EXISTS printer_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port TEXT NOT NULL,
            baud_rate INTEGER NOT NULL,
            density INTEGER NOT NULL,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelTemplate {
    id: Option<i64>,
    name: String,
    width: i32,
    height: i32,
    font_size: i32,
    show_price: bool,
    show_code: bool,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LabelData {
    name_short: String,
    code: String,
    width: i32,
    height: i32,
    print_settings: PrintSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintSettings {
    density: i32,
    speed: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrinterSettings {
    port: String,
    baud_rate: i32,
    density: i32,
    width: i32,
    height: i32,
    speed: i32,
}

#[tauri::command]
fn create_product(product: Product, db: State<DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    match conn.execute(
        "INSERT INTO products (name, name_short, code, description) VALUES (?, ?, ?, ?)",
        params![&product.name, &product.name_short, &product.code, &product.description],
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
fn get_product(id: i64, db: State<DbConnection>) -> Result<Product, String> {
    let conn = db.0.lock().unwrap();
    match conn.query_row(
        "SELECT id, name, name_short, code, description, created_at, updated_at FROM products WHERE id = ?",
        params![id],
        |row| {
            Ok(Product {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                name_short: row.get(2)?,
                code: row.get(3)?,
                description: Some(row.get::<_, String>(4)?),
                created_at: Some(row.get::<_, String>(5)?),
                updated_at: Some(row.get::<_, String>(6)?),
            })
        },
    ) {
        Ok(product) => Ok(product),
        Err(e) => Err(e.to_string()),
    }
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
async fn print_label(product: Product, db: State<'_, DbConnection>) -> Result<(), String> {
    // Tenta imprimir primeiro
    let settings = get_printer_settings(db.clone()).await?.unwrap_or(PrinterSettings {
        port: "COM1".to_string(),
        baud_rate: 9600,
        density: 8,
        width: 400,
        height: 240,
        speed: 2,
    });
    
    let mut printer = PPLAPrinter::new();
    printer.connect(&settings.port, settings.baud_rate)?;
    printer.print_label(&product, &settings)?;

    // Se chegou aqui, a impressão foi bem sucedida
    let conn = db.0.lock().unwrap();
    match conn.execute(
        "INSERT INTO print_jobs (product_id, product_name, product_code, status) VALUES (?, ?, ?, ?)",
        params![
            product.id.unwrap_or(-1),
            product.name,
            product.code,
            "completed"
        ],
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
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
fn list_serial_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| {
            ports.into_iter()
                .map(|p| p.port_name)
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_template(template: LabelTemplate, db: State<'_, DbConnection>) -> Result<i64, String> {
    let conn = db.0.lock().unwrap();
    match conn.execute(
        "INSERT INTO label_templates (name, width, height, font_size, show_price, show_code) 
         VALUES (?, ?, ?, ?, ?, ?)",
        params![
            template.name,
            template.width,
            template.height,
            template.font_size,
            template.show_price,
            template.show_code
        ],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            Ok(id)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_templates(db: State<'_, DbConnection>) -> Result<Vec<LabelTemplate>, String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, width, height, font_size, show_price, show_code, created_at, updated_at 
             FROM label_templates"
        )
        .map_err(|e| e.to_string())?;

    let templates = stmt
        .query_map([], |row| {
            Ok(LabelTemplate {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                width: row.get(2)?,
                height: row.get(3)?,
                font_size: row.get(4)?,
                show_price: row.get(5)?,
                show_code: row.get(6)?,
                created_at: Some(row.get(7)?),
                updated_at: Some(row.get(8)?),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for template in templates {
        result.push(template.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
async fn update_template(id: i64, template: LabelTemplate, db: State<'_, DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    match conn.execute(
        "UPDATE label_templates 
         SET name = ?, width = ?, height = ?, font_size = ?, show_price = ?, show_code = ?, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
        params![
            template.name,
            template.width,
            template.height,
            template.font_size,
            template.show_price,
            template.show_code,
            id
        ],
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn delete_template(id: i64, db: State<'_, DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    match conn.execute("DELETE FROM label_templates WHERE id = ?", params![id]) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn print_test_label(label_data: LabelData) -> Result<(), String> {
    let mut printer = PPLAPrinter::new();
    printer.connect("COM1", 9600)?;

    let commands = vec![
        format!("Q{},24\r\n", label_data.height * 8),  // Altura em dots (8 dots = 1mm)
        format!("q{}\r\n", label_data.width * 8),      // Largura em dots
        format!("S{}\r\n", label_data.print_settings.speed),  // Velocidade configurável
        format!("D{}\r\n", label_data.print_settings.density), // Densidade configurável
        "ZT\r\n".to_string(),                         // Limpa buffer
        format!("A50,10,0,3,1,1,N,\"{}\"\r\n", "ESTRELA METAIS"),
        format!("A50,40,0,2,1,1,N,\"{}\"\r\n", label_data.name_short),
        format!("A50,70,0,2,1,1,N,\"{}\"\r\n", label_data.code),
        format!("B50,100,0,1,2,2,80,B,\"789846581{}\"\r\n", label_data.code),
        "P1\r\n".to_string(),                         // Imprime 1 etiqueta
    ];

    for cmd in commands {
        printer.port.as_mut()
            .ok_or_else(|| "Impressora não conectada".to_string())?
            .write_all(cmd.as_bytes())
            .map_err(|e| format!("Erro ao enviar comando: {}", e))?;
    }

    Ok(())
}


#[tauri::command]
async fn save_printer_settings(config: PrinterSettings, db: State<'_, DbConnection>) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    
    // Primeiro, remove configurações existentes
    conn.execute("DELETE FROM printer_settings", [])
        .map_err(|e| e.to_string())?;
    
    // Insere as novas configurações
    conn.execute(
        "INSERT INTO printer_settings (
            port, baud_rate, density, width, height, speed
        ) VALUES (?, ?, ?, ?, ?, ?)",
        params![
            config.port,
            config.baud_rate,
            config.density,
            config.width,
            config.height,
            config.speed,
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn get_printer_settings(db: State<'_, DbConnection>) -> Result<Option<PrinterSettings>, String> {
    let conn = db.0.lock().unwrap();
    
    let result = conn.query_row(
        "SELECT port, baud_rate, density, width, height, speed FROM printer_settings LIMIT 1",
        [],
        |row| {
            Ok(PrinterSettings {
                port: row.get(0)?,
                baud_rate: row.get(1)?,
                density: row.get(2)?,
                width: row.get(3)?,
                height: row.get(4)?,
                speed: row.get(5)?,
            })
        },
    );
    
    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
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
            print_label,
            get_print_history,
            list_serial_ports,
            create_template,
            get_templates,
            update_template,
            delete_template,
            print_test_label,
            save_printer_settings,
            get_printer_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

