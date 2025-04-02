#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::OptionalExtension;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, AppHandle, State};

// Importar o módulo windows_printing
mod windows_printing;

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
  selected_printer: Option<String>, // Impressora selecionada
}

impl Default for PrinterConfig {
  fn default() -> Self {
      Self {
          darkness: 8,    // Densidade média
          width: 840,     // 105mm * 8 dots (3 etiquetas de 33mm + 2 espaços de 2mm)
          height: 176,    // 22mm * 8 dots
          speed: 2,       // Velocidade média
          port: "Windows".to_string(), // Agora o padrão é Windows
          selected_printer: None,      // Inicialmente nenhuma impressora selecionada
      }
  }
}

// Wrapper para o banco de dados
struct DbConnection(Arc<Mutex<Connection>>);

// Estrutura para controlar o estado da atualização
struct UpdaterState {
  checking: AtomicBool,
}

// Estrutura para informações de atualização
#[derive(Debug, Serialize, Deserialize, Clone)]
struct UpdateInfo {
  version: String,
  body: Option<String>,
  date: String,
}

// Estrutura para configurações de atualização
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
          "ALTER TABLE printer_settings ADD COLUMN port TEXT NOT NULL DEFAULT 'Windows'",
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

// Função para verificar a sequência atual
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

// Função para impressão de lote usando formato PPLA para Argox
#[tauri::command]
async fn print_label_batch(products: Vec<Option<Product>>, app_handle: AppHandle, printer_name: Option<String>) -> Result<(), String> {
  println!("Iniciando impressão de lote com {} produtos...", products.len());
  
  // Obter impressoras do Windows
  let printers = windows_printing::list_windows_printers()?;
  if printers.is_empty() {
    return Err("Nenhuma impressora Windows encontrada. Instale uma impressora no sistema.".to_string());
  }
  
  // Usar a impressora especificada ou a primeira da lista
  let printer_to_use = match printer_name {
    Some(name) if printers.contains(&name) => name,
    Some(name) => {
      println!("AVISO: Impressora solicitada '{}' não encontrada. Usando a primeira disponível.", name);
      printers[0].clone()
    },
    None => {
      println!("Impressora não especificada, usando a primeira da lista");
      printers[0].clone()
    }
  };
  
  println!("Usando impressora Windows: {}", printer_to_use);
  
  // Obter o estado do banco de dados
  let db_state = app_handle.state::<DbConnection>();
  let conn = match db_state.0.lock() {
    Ok(conn) => conn,
    Err(e) => return Err(format!("Erro ao acessar banco de dados: {}", e)),
  };
  
  // Criar o conteúdo da etiqueta no formato PPLA
  let mut label_content = Vec::new();
  
  // Sequência de inicialização com parâmetros corretos para a fita de 105mm
  label_content.extend_from_slice(b"N\r\n");                  // Limpa buffer
  label_content.extend_from_slice(b"ZN\r\n");                 // Direção normal
  label_content.extend_from_slice(b"q840\r\n");               // Largura da fita (105mm = 840 dots)
  label_content.extend_from_slice(b"Q176,25\r\n");            // Altura da etiqueta (22mm = 176 dots) e gap
  label_content.extend_from_slice(b"O\r\n");                  // Orientação padrão
  label_content.extend_from_slice(b"JF\r\n");                 // Configuração de impressão
  label_content.extend_from_slice(b"Z0\r\n");                 // Sem deslocamento vertical
  
  // Posições X exatas para cada etiqueta baseadas nas medidas fornecidas
  // Margem esquerda: 1.5mm = 12 dots
  // Largura da etiqueta: 33mm = 264 dots
  // Espaço entre etiquetas: 2mm = 16 dots
  let x_positions = [
    12,                     // Primeira etiqueta: margem esquerda
    12 + 264 + 16,          // Segunda etiqueta: margem + largura + espaço = 292
    12 + 264 + 16 + 264 + 16 // Terceira etiqueta: 292 + largura + espaço = 572
  ];
  
  // Adicionar cada produto
  for (index, product) in products.iter().enumerate().filter(|(_, p)| p.is_some()) {
    let product = product.as_ref().unwrap();
    let x = x_positions[index % 3];
    
    // Centralizar o texto - calculando a posição central de cada etiqueta
    let center_x = x + 5; // Centro da etiqueta (largura 264 dots / 2)
    
    // Adicionar empresa (centralizado) - Y=15 (margem superior)
    let company_cmd = format!("A{},15,0,3,1,1,N,\"ESTRELA METAIS\"\r\n", center_x);
    label_content.extend_from_slice(company_cmd.as_bytes());
    
    // Adicionar nome do produto (centralizado) - Y=45
    let name_cmd = format!("A{},45,0,2,1,1,N,\"{}\"\r\n", center_x, product.name_short);
    label_content.extend_from_slice(name_cmd.as_bytes());
    
    // Adicionar código do produto (centralizado) - Y=70
    let code_cmd = format!("A{},70,0,2,1,1,N,\"{}\"\r\n", center_x, product.product_code);
    label_content.extend_from_slice(code_cmd.as_bytes());
    
    // Adicionar código de barras EAN-13 (centralizado e horizontal) - Y=95
    // Ajustando a posição X para centralizar o código de barras na etiqueta
    // Para um código de barras EAN-13, a largura é aproximadamente 95-100 dots
    // Então, center_x - 50 deve centralizar o código
    let barcode_cmd = format!("B{},95,0,1,2,6,45,B,\"{}\"\r\n", center_x , product.barcode);
    label_content.extend_from_slice(barcode_cmd.as_bytes());
    
    // Registrar impressão no histórico
    match conn.execute(
      "INSERT INTO print_jobs (product_id, product_name, product_code, status) VALUES (?, ?, ?, ?)",
      params![
        product.id,
        &product.name,
        &product.product_code,
        "completed"
      ],
    ) {
      Ok(_) => {},
      Err(e) => println!("Erro ao registrar impressão no histórico: {}", e),
    }
  }
  
  // Comando de impressão
  label_content.extend_from_slice(b"P1\r\n");
  
  println!("Enviando trabalho de impressão para '{}' com {} bytes", printer_to_use, label_content.len());
  
  // Envia para a impressora Windows
  match windows_printing::print_to_windows_printer(&printer_to_use, "Etiquetas", &label_content) {
    Ok(_) => {
      println!("Impressão enviada com sucesso para '{}'", printer_to_use);
      Ok(())
    },
    Err(e) => {
      println!("ERRO ao enviar para impressora: {}", e);
      Err(e)
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

// Função para teste de impressão usando formato PPLA para Argox
#[tauri::command]
async fn print_test(printer_name: Option<String>) -> Result<(), String> {
  println!("Iniciando teste de impressão...");
  
  // Obter impressoras do Windows
  let printers = windows_printing::list_windows_printers()?;
  if printers.is_empty() {
    return Err("Nenhuma impressora Windows encontrada. Instale uma impressora no sistema.".to_string());
  }
  
  // Usar a impressora especificada ou a primeira da lista
  let printer_to_use = match printer_name {
    Some(name) if printers.contains(&name) => name,
    Some(name) => {
      println!("AVISO: Impressora solicitada '{}' não encontrada. Usando a primeira disponível.", name);
      printers[0].clone()
    },
    None => {
      println!("Impressora não especificada, usando a primeira da lista");
      printers[0].clone()
    }
  };
  
  println!("Usando impressora Windows para teste: {}", printer_to_use);
  
  // Comando de teste para Argox no formato PPLA (baseado no dump)
  let test_content = b"N\r\n\
    GW620,215,13,32\r\n\
    ZN\r\n\
    q822\r\n\
    O\r\n\
    JF\r\n\
    \x1BKIZZQ0\r\n\
    \x1BKI9+0.0\r\n\
    ZT\r\n\
    Q1218,25\r\n\
    A50,50,0,3,1,1,N,\"TESTE DE IMPRESSAO\"\r\n\
    A50,100,0,3,1,1,N,\"ARGOX OS-2140\"\r\n\
    B50,150,1,1,3,7,100,B,\"123456789012\"\r\n\
    P1\r\n";
  
  // Envia para a impressora Windows
  match windows_printing::print_to_windows_printer(&printer_to_use, "Teste", test_content) {
    Ok(_) => {
      println!("Teste de impressão enviado com sucesso para '{}'", printer_to_use);
      Ok(())
    },
    Err(e) => {
      println!("ERRO ao enviar teste para impressora: {}", e);
      Err(e)
    }
  }
}

#[tauri::command]
async fn save_printer_settings(config: PrinterConfig, db: State<'_, DbConnection>) -> Result<(), String> {
  println!("Salvando configurações de impressora");

  let conn = db.0.lock().unwrap();

  conn.execute("DELETE FROM printer_settings", [])
      .map_err(|e| e.to_string())?;

  // Verifique se a coluna selected_printer existe
  let has_selected_printer_column = conn
      .query_row(
          "SELECT COUNT(*) FROM pragma_table_info('printer_settings') WHERE name = 'selected_printer'",
          [],
          |row| row.get::<_, i32>(0),
      )
      .unwrap_or(0) > 0;

  // Adicionar coluna se não existir
  if !has_selected_printer_column {
      println!("Adicionando coluna 'selected_printer' à tabela printer_settings");
      conn.execute(
          "ALTER TABLE printer_settings ADD COLUMN selected_printer TEXT",
          [],
      )
      .map_err(|e| e.to_string())?;
  }

  // Preparar o valor da impressora selecionada (NULL se None)
  let selected_printer = config.selected_printer.as_ref().map(|s| s.as_str());

  conn.execute(
      "INSERT INTO printer_settings (
          darkness, width, height, speed, port, selected_printer
      ) VALUES (?, ?, ?, ?, ?, ?)",
      params![
          config.darkness,
          config.width,
          config.height,
          config.speed,
          config.port,
          selected_printer,
      ],
  ).map_err(|e| e.to_string())?;

  println!("Configurações de impressora salvas com sucesso");
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

  // Verifica se a coluna "selected_printer" existe
  let has_selected_printer_column = conn
      .query_row(
          "SELECT COUNT(*) FROM pragma_table_info('printer_settings') WHERE name = 'selected_printer'",
          [],
          |row| row.get::<_, i32>(0),
      )
      .unwrap_or(0) > 0;

  let result = if has_port_column && has_selected_printer_column {
      // Se ambas as colunas existirem, usa a consulta completa
      conn.query_row(
          "SELECT darkness, width, height, speed, port, selected_printer FROM printer_settings LIMIT 1",
          [],
          |row| {
              Ok(PrinterConfig {
                  darkness: row.get(0)?,
                  width: row.get(1)?,
                  height: row.get(2)?,
                  speed: row.get(3)?,
                  port: row.get(4)?,
                  selected_printer: row.get(5)?,
              })
          },
      )
  } else if has_port_column {
      // Se apenas a coluna "port" existir
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
                  selected_printer: None,
              })
          },
      )
  } else {
      // Se nenhuma das novas colunas existir
      conn.query_row(
          "SELECT darkness, width, height, speed FROM printer_settings LIMIT 1",
          [],
          |row| {
              Ok(PrinterConfig {
                  darkness: row.get(0)?,
                  width: row.get(1)?,
                  height: row.get(2)?,
                  speed: row.get(3)?,
                  port: "Windows".to_string(),
                  selected_printer: None,
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

// Conexão e configuração de impressora
#[tauri::command]
async fn connect_printer(config: PrinterConfig, printer_name: Option<String>) -> Result<(), String> {
  println!("Verificando configurações de impressora: {:?}", config);
  
  // Obter impressoras do Windows
  let printers = windows_printing::list_windows_printers()?;
  if printers.is_empty() {
    return Err("Nenhuma impressora Windows encontrada. Instale uma impressora no Windows para continuar.".to_string());
  }
  
  // Verificar se a impressora selecionada existe
  let printer_to_use = match printer_name {
    Some(name) if printers.contains(&name) => name,
    Some(name) => return Err(format!("Impressora selecionada \"{}\" não encontrada no sistema", name)),
    None => printers[0].clone(),
  };
  
  println!("Impressora Windows selecionada: {}. Configurações salvas.", printer_to_use);
  Ok(())
}

// Lista somente impressoras do Windows
#[tauri::command]
async fn list_printers(silent: Option<bool>) -> Result<Vec<String>, String> {
  // Usar a versão silenciosa se solicitado, caso contrário usar a versão padrão
  let printers = if silent.unwrap_or(false) {
    println!("Listando impressoras Windows em modo silencioso...");
    windows_printing::list_windows_printers_silent()?
  } else {
    println!("Listando impressoras Windows com interface padrão...");
    windows_printing::list_windows_printers()?
  };
  
  println!("Impressoras Windows detectadas: {:?}", printers);
  Ok(printers)
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
                  .unwrap_or_else(|| "Data desconhecida ".to_string());
              
              // Emitir evento para o frontend - usando um nome diferente para evitar comportamento automático
              let _ = app_handle.emit_all("update-manual-check ", UpdateInfo {
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
              return Err("Não há atualizações disponíveis ".to_string());
          }
          update
      },
      Err(e) => {
          return Err(format!("Erro ao verificar atualizações: {}", e));
      }
  };

  // Emitir evento de início do download
  let _ = app_handle.emit_all("update-pending ", ());

  // Iniciar o processo de atualização
  match update.download_and_install().await {
      Ok(_) => {
          println!("Atualização instalada com sucesso ");
          let _ = app_handle.emit_all("update-installed ", ());
          Ok(())
      },
      Err(e) => {
          println!("Erro ao instalar atualização: {}", e);
          let _ = app_handle.emit_all("update-error ", serde_json::json!({
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
                  println!("Nova versão disponível na inicialização ");
                  
                  // Extrair informações da atualização
                  let version = update.latest_version().to_string();
                  let body = update.body().map(|s| s.to_string());
                  
                  // Formatar a data para exibição
                  let date_str = update.date()
                      .map(|d| format!("{}-{:02}-{:02}", d.year(), d.month() as u8, d.day()))
                      .unwrap_or_else(|| "Data desconhecida ".to_string());
                  
                  // Emitir evento para o frontend - usando um nome completamente diferente
                  // para evitar qualquer comportamento automático existente
                  let _ = app_handle.emit_all("update-startup-notification ", UpdateInfo {
                      version,
                      body,
                      date: date_str,
                  });
                  
                  // NÃO emitir nenhum outro evento que possa acionar instalação automática
              } else {
                  println!("Sistema já está na versão mais recente ");
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
async fn get_update_settings(_app_handle: AppHandle) -> Result<UpdateSettings, String> {
  // Aqui você pode carregar as configurações de um arquivo ou banco de dados
  // Por enquanto, retornamos o valor padrão
  Ok(UpdateSettings::default())
}

// Verificar se existe impressora conectada ao sistema
#[tauri::command]
async fn is_printer_connected() -> bool {
  // Verificar se existem impressoras no Windows
  match windows_printing::list_windows_printers() {
    Ok(printers) if !printers.is_empty() => true,
    _ => false
  }
}

// Teste de conexão com impressora Windows
#[tauri::command]
async fn test_printer_connection(_config: PrinterConfig) -> Result<(), String> {
  // Obter impressoras do Windows
  let printers = windows_printing::list_windows_printers()?;
  if printers.is_empty() {
    return Err("Nenhuma impressora Windows encontrada. Instale uma impressora no sistema.".to_string());
  }
  
  println!("Testando impressora Windows: {}", printers[0]);
  
  // Envia um comando simples para testar
  let test_content = b"N\r\nGW620,215,13,32\r\nP1\r\n";
  match windows_printing::print_to_windows_printer(&printers[0], "Teste de Conexão ", test_content) {
    Ok(_) => Ok(()),
    Err(e) => Err(format!("Erro ao testar impressora: {}", e))
  }
}

// Função para teste com o formato exato capturado
#[tauri::command]
fn print_argox_ppla_exact(printer_name: String) -> Result<(), String> {
  println!("Enviando comando PPLA exato para: {}", printer_name);
  
  // Comando PPLA exato capturado do dump
  let ppla_command = [
    0x4E, 0x0D, 0x0A, 0x47, 0x57, 0x36, 0x32, 0x30, 0x2C, 0x32, 0x31, 0x35, 0x2C, 0x31, 0x33, 0x2C,
    0x33, 0x32, 0x2C, 0xF8, 0x1F, 0x98, 0x7F, 0xFE, 0x07, 0xF3, 0xE7, 0xCF, 0xC0, 0xFC, 0x7F, 0xCF
    // Primeiros 32 bytes do dump - você pode adicionar mais se necessário
  ];
  
  windows_printing::print_to_windows_printer(&printer_name, "Teste PPLA Exato ", &ppla_command)
}

// Função para teste de formatos de impressora
#[tauri::command]
fn test_printer_format(printer_name: String, format_type: String) -> Result<(), String> {
  println!("Testando formato {} na impressora {}", format_type, printer_name);
  
  let test_data: Vec<u8> = match format_type.as_str() {
    "ppla" => {
      println!("Usando formato PPLA ");
      b"N\r\nGW620,215,13,32\r\nA50,50,0,3,1,1,N,\"TESTE PPLA\"\r\nB50,100,1,1,3,7,100,B,\"123456789012\"\r\nP1\r\n".to_vec()
    },
    "pplb" => {
      println!("Usando formato PPLB");
      b"N\r\nq840\r\nQ176,24\r\nD8\r\nS2\r\nA50,50,0,3,1,1,\"Teste PPLB\"\r\nB50,100,2,2,60,0,1,\"123456789012\"\r\nP1\r\n".to_vec()
    },
    "zpl" => {
      println!("Usando formato ZPL");
      b"^XA\n^FO50,50^A0N,50,50^FDTeste ZPL^FS\n^FO50,120^BY3^BCN,100,Y,N,N\n^FD123456789012^FS\n^XZ".to_vec()
    },
    "text" => {
      println!("Usando texto simples");
      "TESTE DE IMPRESSÃO\r\nLinha 1\r\nLinha 2\r\n\r\n\r\n".as_bytes().to_vec()
    },
    _ => {
      return Err(format!("Formato desconhecido: {}", format_type));
    }
  };
  
  println!("Enviando {} bytes para a impressora", test_data.len());
  windows_printing::print_to_windows_printer(&printer_name, &format!("Teste {}", format_type), &test_data)
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

// Função principal
fn main() {
  // Atualizar a inicialização da estrutura UpdaterState no main()
  let updater_state = Arc::new(UpdaterState {
      checking: AtomicBool::new(false),
  });

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
          
          Ok(())
      })
      .invoke_handler(tauri::generate_handler![
          get_products,
          get_product,
          create_product,
          update_product,
          delete_product,
          get_current_sequence,
          print_label_batch,
          get_print_history,
          save_printer_settings,
          get_printer_settings,
          connect_printer,
          print_test,
          list_printers,
          check_update_from_backend,
          install_update_from_backend,
          save_update_settings,
          get_update_settings,
          is_printer_connected,
          test_printer_connection,
          test_printer_format,
          print_argox_ppla_exact,
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}