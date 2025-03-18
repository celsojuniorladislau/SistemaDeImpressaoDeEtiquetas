#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusb::{Context, DeviceHandle, UsbContext};
use rusqlite::OptionalExtension;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Manager, AppHandle, State};
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
  port: String,      // Porta da impressora
}

impl Default for PrinterConfig {
  fn default() -> Self {
      Self {
          darkness: 8,    // Densidade média
          width: 840,     // 105mm * 8 dots (3 etiquetas de 33mm + 2 espaços de 2mm)
          height: 176,    // 22mm * 8 dots
          speed: 2,       // Velocidade média
          port: "USB".to_string(), // Porta padrão
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

// Adicione esta estrutura para simular a impressora durante o desenvolvimento
#[derive(Debug)]
struct MockPrinter {
  config: PrinterConfig,
}

impl MockPrinter {
  fn new(config: PrinterConfig) -> Self {
      println!("[MOCK] Criando impressora simulada com configuração: {:?}", config);
      MockPrinter { config }
  }

  fn write(&self, data: &[u8]) -> Result<usize, String> {
      println!("[MOCK] Enviando dados para impressora: {}", String::from_utf8_lossy(data));
      Ok(data.len())
  }

  fn read(&self, buffer: &mut [u8]) -> Result<usize, String> {
      // Simula uma resposta da impressora
      let response = b"OK\r\n";
      let len = response.len().min(buffer.len());
      buffer[..len].copy_from_slice(&response[..len]);
      println!("[MOCK] Lendo dados da impressora: {}", String::from_utf8_lossy(&buffer[..len]));
      Ok(len)
  }

  fn print_label(&self, text: &str) -> Result<(), String> {
      println!("[MOCK] Imprimindo etiqueta (PPLB): {}", text);
      Ok(())
  }

  fn test_connection(&self) -> Result<(), String> {
      println!("[MOCK] Testando conexão com a impressora (PPLB)");
      Ok(())
  }
}

// Enum para representar o tipo de impressora (real ou simulada)
enum PrinterType {
  Real(UsbPrinter),
  Mock(MockPrinter),
}

// Estrutura para controlar o estado da atualização
struct UpdaterState {
  checking: AtomicBool,
  installing: AtomicBool,  // Inicializar o novo campo
}

// Estrutura para informações de atualização
#[derive(Debug, Serialize, Deserialize, Clone)]
struct UpdateInfo {
  version: String,
  body: Option<String>,
  date: String,
}

// Adicionando uma nova estrutura para configurações de atualização
#[derive(Debug, Serialize, Deserialize, Clone)]
struct UpdateSettings {
  auto_install: bool,
}

impl Default for UpdateSettings {
  fn default() -> Self {
      Self {
          auto_install: false, // Desabilita instalação automática por padrão
      }
  }
}

// Modifique a variável global PRINTER para usar o enum PrinterType
static PRINTER: Lazy<Mutex<Option<PrinterType>>> = Lazy::new(|| Mutex::new(None));

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

  // Modificado para usar comandos PPLB
  fn print_label(&self, text: &str) -> Result<(), String> {
      let commands = vec![
          "^XA\r\n".to_string(),                      // Iniciar formato
          "^LH0,0\r\n".to_string(),                   // Posição inicial
          format!("^LL{}\r\n", self.config.height),   // Altura da etiqueta
          format!("^PW{}\r\n", self.config.width),    // Largura da etiqueta
          format!("^PR{}\r\n", self.config.speed),    // Velocidade de impressão
          format!("^MD{}\r\n", self.config.darkness), // Densidade de impressão
          format!("^FO50,50^A0N,30,30^FD{}^FS\r\n", text), // Texto
          "^PQ1\r\n".to_string(),                     // Quantidade (1 etiqueta)
          "^XZ\r\n".to_string(),                      // Finalizar formato
      ];

      for cmd in commands {
          self.write(cmd.as_bytes())?;
      }

      Ok(())
  }

  // Modificado para usar comandos PPLB
  fn test_connection(&self) -> Result<(), String> {
      // Comando de status em PPLB (^HH retorna informações de configuração)
      self.write(b"^XA^HH^XZ\r\n")?;
      
      let mut buffer = [0u8; 32];
      let read = self.read(&mut buffer)?;
      
      if read > 0 {
          Ok(())
      } else {
          Err("Impressora não respondeu".to_string())
      }
  }
}

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

  // Primeiro, cria a tabela se não existir
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

  // Verifica se a coluna "port" existe na tabela
  let has_port_column = conn
      .query_row(
          "SELECT COUNT(*) FROM pragma_table_info('printer_settings') WHERE name = 'port'",
          [],
          |row| row.get::<_, i32>(0),
      )
      .unwrap_or(0) > 0;

  // Se a coluna não existir, adiciona-a
  if !has_port_column {
      println!("Adicionando coluna 'port' à tabela printer_settings");
      conn.execute(
          "ALTER TABLE printer_settings ADD COLUMN port TEXT NOT NULL DEFAULT 'USB'",
          [],
      )
      .expect("failed to add port column to printer_settings table");
  }

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

fn is_product_code_unique(conn: &Connection, product_code: &str, exclude_id: Option<i64>) -> Result<bool, String> {
  let count: i32 = match exclude_id {
      Some(id) => conn
          .query_row(
              "SELECT COUNT(*) FROM products WHERE product_code = ? AND id != ?",
              params![product_code, id],
              |row| row.get(0),
          )
          .map_err(|e| e.to_string())?,
      None => conn
          .query_row(
              "SELECT COUNT(*) FROM products WHERE product_code = ?",
              params![product_code],
              |row| row.get(0),
          )
          .map_err(|e| e.to_string())?,
  };

  Ok(count == 0)
}

#[tauri::command]
fn create_product(mut product: Product, db: State<DbConnection>) -> Result<Product, String> {
  // Validar código do produto
  validate_product_code(&product.product_code)?;

  let mut conn = db.0.lock().unwrap();

  // Verificar se o código do produto já existe
  if !is_product_code_unique(&conn, &product.product_code, None)? {
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
  if !is_product_code_unique(&conn, &product.product_code, Some(id))? {
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

// Modifique a função print_label_batch para usar PPLB
#[tauri::command]
async fn print_label_batch(products: Vec<Option<Product>>, app_handle: AppHandle) -> Result<(), String> {
  println!("Iniciando impressão de lote com {} produtos...", products.len());
  let printer_guard = PRINTER.lock().unwrap();
  
  match &*printer_guard {
      Some(PrinterType::Real(printer)) => {
          println!("Usando impressora real para impressão de lote");
          
          // Iniciar o formato PPLB
          let mut commands = vec![
              "^XA\r\n".to_string(),                      // Iniciar formato
              "^LH0,0\r\n".to_string(),                   // Posição inicial
              format!("^LL{}\r\n", printer.config.height), // Altura da etiqueta
              format!("^PW{}\r\n", printer.config.width),  // Largura da etiqueta
              format!("^PR{}\r\n", printer.config.speed),  // Velocidade
              format!("^MD{}\r\n", printer.config.darkness), // Densidade
          ];

          // Posições X para cada etiqueta
          let x_positions = [50, 314, 578];

          // Adiciona comandos para cada etiqueta
          for (index, product) in products.iter().enumerate() {
              if let Some(product) = product {
                  let x = x_positions[index];
                  commands.extend(vec![
                      // Empresa
                      format!("^FO{},24^A0N,20,20^FDESTRELA METAIS^FS\r\n", x),
                      // Nome curto do produto
                      format!("^FO{},48^A0N,20,20^FD{}^FS\r\n", x, product.name_short),
                      // Código do produto
                      format!("^FO{},72^A0N,20,20^FD{}^FS\r\n", x, product.product_code),
                      // Código de barras
                      format!("^FO{},96^BY2^BEN,60,Y,N^FD{}^FS\r\n", x, product.barcode),
                  ]);
              }
          }

          // Finalizar o formato e imprimir
          commands.push("^PQ1\r\n".to_string());  // Quantidade (1 etiqueta)
          commands.push("^XZ\r\n".to_string());   // Finalizar formato

          for cmd in commands {
              printer.write(cmd.as_bytes())?;
          }

          Ok(())
      },
      Some(PrinterType::Mock(printer)) => {
          println!("[MOCK] Iniciando impressão simulada de lote com {} produtos", 
                   products.iter().filter(|p| p.is_some()).count());
          
          // Simula a impressão de cada produto
          for (index, product) in products.iter().enumerate() {
              if let Some(product) = product {
                  println!("[MOCK] Etiqueta {}: {} - {} - {}", 
                           index + 1, 
                           product.name_short, 
                           product.product_code, 
                           product.barcode);
              }
          }
          
          println!("[MOCK] Impressão simulada de lote concluída com sucesso");
          Ok(())
      },
      None => {
          println!("Erro: Nenhuma impressora conectada (nem real nem simulada)");
          Err("Impressora não conectada".to_string())
      }
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

// Modifique a função print_test para usar PPLB
#[tauri::command]
async fn print_test() -> Result<(), String> {
  println!("Iniciando teste de impressão...");
  let printer_guard = PRINTER.lock().unwrap();
  
  match &*printer_guard {
      Some(PrinterType::Real(printer)) => {
          println!("Usando impressora real para teste");
          
          // Comando de teste  => {
          println!("Usando impressora real para teste");
          
          // Comando de teste
          let commands = vec![
              "^XA\r\n".to_string(),                      // Iniciar formato
              "^LH0,0\r\n".to_string(),                   // Posição inicial
              format!("^LL{}\r\n", printer.config.height), // Altura da etiqueta
              format!("^PW{}\r\n", printer.config.width),  // Largura da etiqueta
              format!("^PR{}\r\n", printer.config.speed),  // Velocidade
              format!("^MD{}\r\n", printer.config.darkness), // Densidade
              "^FO50,50^A0N,30,30^FDTeste de Impressão^FS\r\n".to_string(), // Texto
              "^PQ1\r\n".to_string(),                     // Quantidade (1 etiqueta)
              "^XZ\r\n".to_string(),                      // Finalizar formato
          ];

          for cmd in commands {
              printer.write(cmd.as_bytes())?;
          }
          
          Ok(())
      },
      Some(PrinterType::Mock(printer)) => {
          println!("[MOCK] Iniciando teste de impressão simulada");
          printer.print_label("Teste de Impressão")?;
          println!("[MOCK] Teste de impressão simulada concluído com sucesso");
          Ok(())
      },
      None => {
          println!("Erro: Nenhuma impressora conectada (nem real nem simulada)");
          Err("Impressora não conectada".to_string())
      }
  }
}

#[tauri::command]
async fn save_printer_settings(config: PrinterConfig, db: State<'_, DbConnection>) -> Result<(), String> {
  let conn = db.0.lock().unwrap();

  conn.execute("DELETE FROM printer_settings", [])
      .map_err(|e| e.to_string())?;

  conn.execute(
      "INSERT INTO printer_settings (
          darkness, width, height, speed, port
      ) VALUES (?, ?, ?, ?, ?)",
      params![
          config.darkness,
          config.width,
          config.height,
          config.speed,
          config.port,
      ],
  ).map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
async fn get_printer_settings(db: State<'_, DbConnection>) -> Result<Option<PrinterConfig>, String> {
  let conn = db.0.lock().unwrap();

  // Primeiro, verifica se a coluna "port" existe
  let has_port_column = conn
      .query_row(
          "SELECT COUNT(*) FROM pragma_table_info('printer_settings') WHERE name = 'port'",
          [],
          |row| row.get::<_, i32>(0),
      )
      .unwrap_or(0) > 0;

  let result = if has_port_column {
      // Se a coluna existir, usa a consulta completa
      conn.query_row(
          "SELECT darkness, width, height, speed, port FROM printer_settings LIMIT 1",
          [],
          |row| {
              Ok(PrinterConfig {
                  darkness: row.get(0)?,
                  width: row.get(1)?,
                  height: row.get(2)?,
                  speed: row.get(3)?,
                  port: row.get(4)?,
              })
          },
      )
  } else {
      // Se a coluna não existir, usa a consulta sem a coluna "port"
      conn.query_row(
          "SELECT darkness, width, height, speed FROM printer_settings LIMIT 1",
          [],
          |row| {
              Ok(PrinterConfig {
                  darkness: row.get(0)?,
                  width: row.get(1)?,
                  height: row.get(2)?,
                  speed: row.get(3)?,
                  port: "USB".to_string(), // Valor padrão
              })
          },
      )
  };

  match result {
      Ok(settings) => Ok(Some(settings)),
      Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
      Err(e) => Err(e.to_string()),
  }
}

// Substitua a função list_all_usb_devices completamente por esta versão:

#[tauri::command]
async fn list_all_usb_devices() -> Result<Vec<String>, String> {
  let context = Context::new()
      .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;

  let devices = context
      .devices()
      .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?;

  let mut device_info = Vec::new();

  for device in devices.iter() {
      if let Ok(desc) = device.device_descriptor() {
          let vid = desc.vendor_id();
          let pid = desc.product_id();
          
          let mut info = format!("Dispositivo: VID={:04x}, PID={:04x}", vid, pid);
          
          if let Ok(handle) = device.open() {
              if let Ok(manufacturer) = handle.read_manufacturer_string_ascii(&desc) {
                  info.push_str(&format!(", Fabricante: {}", manufacturer));
              }
              
              if let Ok(product) = handle.read_product_string_ascii(&desc) {
                  info.push_str(&format!(", Produto: {}", product));
              }
          }
          
          device_info.push(info);
      }
  }

  Ok(device_info)
}

// Modifique a função connect_printer para tentar conectar à impressora real
// e, se falhar, criar uma impressora simulada
#[tauri::command]
async fn connect_printer(config: PrinterConfig) -> Result<(), String> {
  println!("Tentando conectar à impressora com configuração: {:?}", config);
  
  // Tenta conectar à impressora real
  match connect_real_printer(config.clone()).await {
      Ok(printer) => {
          println!("Impressora real conectada com sucesso!");
          let mut printer_guard = PRINTER.lock().unwrap();
          *printer_guard = Some(PrinterType::Real(printer));
          return Ok(());
      },
      Err(e) => {
          println!("Não foi possível conectar à impressora real: {}", e);
          println!("Criando impressora simulada para desenvolvimento...");
          
          // Cria uma impressora simulada
          let mock_printer = MockPrinter::new(config);
          let mut printer_guard = PRINTER.lock().unwrap();
          *printer_guard = Some(PrinterType::Mock(mock_printer));
          
          println!("[MOCK] Impressora simulada criada e configurada com sucesso");
          return Ok(());
      }
  }
}

// Função para tentar conectar à impressora real
async fn connect_real_printer(config: PrinterConfig) -> Result<UsbPrinter, String> {
  let context = Context::new()
      .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;
  
  println!("Contexto USB criado com sucesso");
  
  let devices = context
      .devices()
      .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?;
  
  println!("Encontrados {} dispositivos USB", devices.iter().count());
  
  // Procura a impressora
  for device in devices.iter() {
      if let Ok(desc) = device.device_descriptor() {
          let vid = desc.vendor_id();
          let pid = desc.product_id();
          
          println!("Verificando dispositivo: VID={:04x}, PID={:04x}", vid, pid);
          
          // Verifica se é a impressora Argox
          if vid == ARGOX_VID && (pid == ARGOX_PID || pid == ARGOX_PID_ALT) {
              println!("Encontrada impressora Argox! VID={:04x}, PID={:04x}", vid, pid);
              
              // Tenta abrir o dispositivo
              match device.open() {
                  Ok(mut handle) => {
                      println!("Conexão aberta com sucesso");
                      
                      // Resetar o dispositivo
                      if let Err(e) = handle.reset() {
                          println!("Aviso: Não foi possível resetar o dispositivo: {}", e);
                          // Continua mesmo se o reset falhar
                      }
                      
                      // Obter configuração
                      let config_desc = match device.config_descriptor(0) {
                          Ok(config) => config,
                          Err(e) => {
                              println!("Erro ao ler configuração: {}", e);
                              continue;
                          }
                      };
                      
                      // Encontrar interface
                      let interface = match config_desc.interfaces().next() {
                          Some(interface) => interface,
                          None => {
                              println!("Interface não encontrada");
                              continue;
                          }
                      };
                      
                      let interface_desc = match interface.descriptors().next() {
                          Some(desc) => desc,
                          None => {
                              println!("Descritor de interface não encontrado");
                              continue;
                          }
                      };
                      
                      println!("Interface encontrada. Número: {}", interface_desc.interface_number());
                      
                      // Tentar desanexar o driver do kernel se estiver ativo
                      #[cfg(any(target_os = "linux", target_os = "macos"))]
                      {
                          match handle.kernel_driver_active(interface_desc.interface_number()) {
                              Ok(true) => {
                                  println!("Driver do kernel ativo, tentando desanexar...");
                                  if let Err(e) = handle.detach_kernel_driver(interface_desc.interface_number()) {
                                      println!("Aviso: Não foi possível desanexar o driver: {}", e);
                                      // Continua mesmo se falhar
                                  }
                              },
                              _ => {}
                          }
                      }
                      
                      // Reivindicar a interface
                      if let Err(e) = handle.claim_interface(interface_desc.interface_number()) {
                          println!("Erro ao configurar interface: {}", e);
                          continue;
                      }
                      
                      // Encontrar endpoints
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
                      
                      let endpoint_out = match endpoint_out {
                          Some(ep) => ep,
                          None => {
                              println!("Endpoint de saída não encontrado");
                              continue;
                          }
                      };
                      
                      let endpoint_in = match endpoint_in {
                          Some(ep) => ep,
                          None => {
                              println!("Endpoint de entrada não encontrado");
                              continue;
                          }
                      };
                      
                      println!("Endpoints configurados. Criando instância da impressora...");
                      
                      // Criar a instância da impressora
                      let printer = UsbPrinter {
                          handle,
                          endpoint_out,
                          endpoint_in,
                          config: config.clone(),
                      };
                      
                      // Testar a conexão
                      match printer.test_connection() {
                          Ok(_) => {
                              println!("Teste de conexão bem-sucedido!");
                              return Ok(printer);
                          },
                          Err(e) => {
                              println!("Teste de conexão falhou: {}", e);
                              continue;
                          }
                      }
                  },
                  Err(e) => {
                      println!("Erro ao abrir conexão: {}", e);
                      continue;
                  }
              }
          }
      }
  }
  
  // Se chegou aqui, não encontrou a impressora
  println!("Impressora Argox não encontrada entre os dispositivos USB");
  Err("Impressora Argox OS-2140 não encontrada".to_string())
}

// Modifique a função list_printers para também verificar a impressora simulada
#[tauri::command]
async fn list_printers() -> Result<Vec<String>, String> {
  // Primeiro, verifica se há uma impressora simulada ativa
  let printer_guard = PRINTER.lock().unwrap();
  let mut printers = Vec::new();
  
  // Se houver uma impressora simulada, adiciona-a à lista
  if let Some(PrinterType::Mock(_)) = &*printer_guard {
      printers.push("Impressora Argox OS-2140 (Simulada)".to_string());
  }
  
  // Continua com a busca por impressoras físicas
  let context = Context::new()
      .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;

  let devices = context
      .devices()
      .map_err(|e| format!("Erro ao listar dispositivos: {}", e))?;

  for device in devices.iter() {
      if let Ok(desc) = device.device_descriptor() {
          // Procura por qualquer dispositivo que possa ser uma impressora
          if let Ok(handle) = device.open() {
              let mut is_printer = false;
              
              // Verifica se é uma Argox
              if desc.vendor_id() == ARGOX_VID && 
                 (desc.product_id() == ARGOX_PID || desc.product_id() == ARGOX_PID_ALT) {
                  is_printer = true;
              }
              
              // Também verifica pelo nome do produto
              if let Ok(product) = handle.read_product_string_ascii(&desc) {
                  if product.to_lowercase().contains("argox") || 
                     product.to_lowercase().contains("printer") || 
                     product.to_lowercase().contains("impressora") {
                      is_printer = true;
                  }
                  
                  if is_printer {
                      printers.push(format!("{} (VID={:04x}, PID={:04x})", 
                                           product, desc.vendor_id(), desc.product_id()));
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

// Funções de atualização automática
// Função modificada para verificar atualizações a partir do backend
#[tauri::command]
async fn check_update_from_backend(app_handle: AppHandle) -> Result<bool, String> {
  println!("Verificando atualizações a partir do backend...");
  
  match app_handle.updater().check().await {
      Ok(update) => {
          let update_available = update.is_update_available();
          println!("Verificação concluída. Atualização disponível: {}", update_available);
          
          if update_available {
              // Extrair informações da atualização
              let version = update.latest_version().to_string();
              let body = update.body().map(|s| s.to_string());
              
              // Formatar a data para exibição
              let date_str = update.date()
                  .map(|d| format!("{}-{:02}-{:02}", d.year(), d.month() as u8, d.day()))
                  .unwrap_or_else(|| "Data desconhecida".to_string());
              
              // Emitir evento para o frontend - usando um nome diferente para evitar comportamento automático
              let _ = app_handle.emit_all("update-manual-check", UpdateInfo {
                  version,
                  body,
                  date: date_str,
              });
          }
          
          Ok(update_available)
      },
      Err(e) => {
          println!("Erro ao verificar atualizações: {}", e);
          Err(format!("Erro ao verificar atualizações: {}", e))
      }
  }
}

#[tauri::command]
async fn install_update_from_backend(app_handle: AppHandle) -> Result<(), String> {
  println!("Instalando atualização a partir do backend...");

  // Verificar se há atualizações disponíveis
  let update = match app_handle.updater().check().await {
      Ok(update) => {
          if !update.is_update_available() {
              return Err("Não há atualizações disponíveis".to_string());
          }
          update
      },
      Err(e) => {
          return Err(format!("Erro ao verificar atualizações: {}", e));
      }
  };

  // Emitir evento de início do download
  let _ = app_handle.emit_all("update-pending", ());

  // Iniciar o processo de atualização
  match update.download_and_install().await {
      Ok(_) => {
          println!("Atualização instalada com sucesso");
          let _ = app_handle.emit_all("update-installed", ());
          Ok(())
      },
      Err(e) => {
          println!("Erro ao instalar atualização: {}", e);
          let _ = app_handle.emit_all("update-error", serde_json::json!({
              "error": e.to_string()
          }));
          Err(format!("Erro ao instalar atualização: {}", e))
      }
  }
}

// Função modificada para verificar atualizações na inicialização
async fn check_update_on_startup(app_handle: AppHandle, updater_state: Arc<UpdaterState>) {
  // Aguarda 2 segundos antes de verificar atualizações para não atrasar a inicialização
  tokio::time::sleep(std::time::Duration::from_secs(2)).await;
  
  // Evita verificações simultâneas
  if updater_state.checking.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
      println!("Verificando atualizações na inicialização...");
      
      match app_handle.updater().check().await {
          Ok(update) => {
              if update.is_update_available() {
                  println!("Nova versão disponível na inicialização");
                  
                  // Extrair informações da atualização
                  let version = update.latest_version().to_string();
                  let body = update.body().map(|s| s.to_string());
                  
                  // Formatar a data para exibição
                  let date_str = update.date()
                      .map(|d| format!("{}-{:02}-{:02}", d.year(), d.month() as u8, d.day()))
                      .unwrap_or_else(|| "Data desconhecida".to_string());
                  
                  // Emitir evento para o frontend - usando um nome completamente diferente
                  // para evitar qualquer comportamento automático existente
                  let _ = app_handle.emit_all("update-startup-notification", UpdateInfo {
                      version,
                      body,
                      date: date_str,
                  });
                  
                  // NÃO emitir nenhum outro evento que possa acionar instalação automática
              } else {
                  println!("Sistema já está na versão mais recente");
              }
          },
          Err(e) => {
              println!("Erro ao verificar atualizações na inicialização: {}", e);
          }
      }
      
      updater_state.checking.store(false, Ordering::SeqCst);
  }
}

// Adicionar uma nova função para salvar as configurações de atualização
#[tauri::command]
async fn save_update_settings(settings: UpdateSettings, app_handle: AppHandle) -> Result<(), String> {
  println!("Salvando configurações de atualização: {:?}", settings);
  
  // Aqui você pode salvar as configurações em um arquivo ou banco de dados
  // Por enquanto, apenas armazenamos na memória do aplicativo
  app_handle.manage(settings);
  
  Ok(())
}

// Adicionar uma nova função para obter as configurações de atualização
#[tauri::command]
async fn get_update_settings(app_handle: AppHandle) -> Result<UpdateSettings, String> {
  // Aqui você pode carregar as configurações de um arquivo ou banco de dados
  // Por enquanto, retornamos o valor padrão
  Ok(UpdateSettings::default())
}

// Adicione esta função para verificar se a impressora está em modo de simulação
#[tauri::command]
async fn is_printer_mock() -> Result<bool, String> {
  let printer_guard = PRINTER.lock().unwrap();
  
  match &*printer_guard {
      Some(PrinterType::Real(_)) => Ok(false),
      Some(PrinterType::Mock(_)) => Ok(true),
      None => Ok(true), // Se não há impressora, consideramos como modo de simulação
  }
}

// Adicione esta função para testar a conexão com a impressora
#[tauri::command]
async fn test_printer_connection(config: PrinterConfig) -> Result<(), String> {
  let printer_guard = PRINTER.lock().unwrap();
  
  match &*printer_guard {
      Some(PrinterType::Real(printer)) => {
          printer.test_connection()?;
          Ok(())
      },
      Some(PrinterType::Mock(printer)) => {
          printer.test_connection()?;
          Ok(())
      },
      None => {
          Err("Impressora não conectada".to_string())
      }
  }
}

// Adicione esta nova função para salvar as configurações da impressora simulada no banco de dados
#[tauri::command]
async fn initialize_mock_printer_settings(app_handle: AppHandle) -> Result<(), String> {
  println!("[MOCK] Salvando configurações da impressora simulada no banco de dados");
  let config = PrinterConfig::default();
  let db = app_handle.state::<DbConnection>();
  save_printer_settings(config, db).await
}

// Modifique a função initialize_mock_printer para registrar que precisamos salvar as configurações
fn initialize_mock_printer() {
  println!("Inicializando impressora simulada na inicialização...");
  let config = PrinterConfig::default();
  let mock_printer = MockPrinter::new(config);
  
  let mut printer_guard = PRINTER.lock().unwrap();
  if printer_guard.is_none() {
      *printer_guard = Some(PrinterType::Mock(mock_printer));
      println!("[MOCK] Impressora simulada inicializada automaticamente na inicialização");
      println!("[MOCK] As configurações serão salvas no banco de dados durante a inicialização da aplicação");
  }
}

// Modifique a função main para chamar a nova função durante a inicialização
fn main() {
  // Atualizar a inicialização da estrutura UpdaterState no main()
  let updater_state = Arc::new(UpdaterState {
      checking: AtomicBool::new(false),
      installing: AtomicBool::new(false),  // Inicializar o novo campo
  });

  // Inicializar a impressora simulada antes de iniciar o aplicativo
  initialize_mock_printer();

  tauri::Builder::default()
      .manage(setup_database())
      .manage(updater_state.clone())
      .setup(move |app| {
          // Verificar atualizações na inicialização
          let app_handle = app.handle().clone();
          let state = updater_state.clone();
          tauri::async_runtime::spawn(async move {
              check_update_on_startup(app_handle, state).await;
          });
          
          // Inicializar configurações da impressora simulada
          let app_handle = app.handle().clone();
          tauri::async_runtime::spawn(async move {
              // Aguarda um momento para garantir que o banco de dados esteja pronto
              tokio::time::sleep(std::time::Duration::from_millis(500)).await;
              
              println!("[MOCK] Tentando salvar configurações da impressora simulada...");
              if let Err(e) = initialize_mock_printer_settings(app_handle.clone()).await {
                  println!("Erro ao salvar configurações da impressora simulada: {}", e);
              } else {
                  println!("[MOCK] Configurações da impressora simulada salvas com sucesso no banco de dados");
              }
          });
          
          // Tentar listar todos os dispositivos USB para diagnóstico
          tauri::async_runtime::spawn(async {
              match list_all_usb_devices().await {
                  Ok(devices) => {
                      println!("=== DISPOSITIVOS USB DETECTADOS ===");
                      for device in devices {
                          println!("{}", device);
                      }
                      println!("==================================");
                  },
                  Err(e) => {
                      println!("Erro ao listar dispositivos USB: {}", e);
                  }
              }
          });
          
          Ok(())
      })
      .invoke_handler(tauri::generate_handler![
          // Comandos existentes...
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
          // Novos comandos de atualização
          check_update_from_backend,
          install_update_from_backend,
          save_update_settings,
          get_update_settings,
          // Novo comando para diagnóstico
          list_all_usb_devices,
          is_printer_mock,
          test_printer_connection,
          // Novo comando para inicializar configurações da impressora simulada
          initialize_mock_printer_settings,
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}