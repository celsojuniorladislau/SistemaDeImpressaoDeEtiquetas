use serde::{Deserialize, Serialize};
use serialport::{SerialPort, SerialPortType};
use std::io::Write;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterConfig {
    pub port: String,
    pub baud_rate: u32,
    pub darkness: u8,      // Densidade de impressão (1-15)
    pub width: u32,        // Largura em dots (8 dots = 1mm)
    pub height: u32,       // Altura em dots
    pub speed: u8,         // Velocidade (1-4)
}

impl Default for PrinterConfig {
    fn default() -> Self {
        Self {
            port: String::new(),
            baud_rate: 9600,
            darkness: 8,    // Densidade média
            width: 400,     // 50mm * 8 dots
            height: 240,    // 30mm * 8 dots
            speed: 2,       // Velocidade média
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PPLACommand {
    pub command_type: String,
    pub x: i32,
    pub y: i32,
    pub rotation: i32,
    pub font: String,
    pub horizontal_multiplier: i32,
    pub vertical_multiplier: i32,
    pub reverse: bool,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintJob {
    pub id: String,
    pub commands: Vec<PPLACommand>,
    pub copies: u32,
    pub status: PrintStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum PrintStatus {
    Pending,
    Printing,
    Completed,
    Failed(String),
}

#[derive(Debug, Error)]
pub enum PrinterError {
    #[error("Erro de porta serial: {0}")]
    SerialPort(#[from] serialport::Error),
    #[error("Porta não encontrada: {0}")]
    PortNotFound(String),
    #[error("Erro de comunicação: {0}")]
    Communication(String),
}

pub struct PPLAPrinter {
    config: PrinterConfig,
    port: Option<Box<dyn SerialPort>>,
}

impl PPLAPrinter {
    pub fn new(config: PrinterConfig) -> Self {
        Self {
            config,
            port: None,
        }
    }

    pub fn connect(&mut self) -> Result<(), PrinterError> {
        let port = serialport::new(&self.config.port, self.config.baud_rate)
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .timeout(Duration::from_millis(1000))
            .open()?;

        self.port = Some(port);
        Ok(())
    }

    pub fn print(&mut self, job: &PrintJob) -> Result<(), PrinterError> {
        let port = self.port.as_mut()
            .ok_or_else(|| PrinterError::Communication("Impressora não conectada".to_string()))?;

        // Configuração inicial da etiqueta
        let setup_commands = vec![
            format!("Q{},{}\r\n", self.config.height, 0),  // Altura
            format!("q{}\r\n", self.config.width),         // Largura
            format!("S{}\r\n", self.config.speed),         // Velocidade
            format!("D{}\r\n", self.config.darkness),      // Densidade
            "ZT\r\n".to_string(),                         // Limpa buffer
        ];

        // Envia configurações
        for cmd in setup_commands {
            port.write_all(cmd.as_bytes())
                .map_err(|e| PrinterError::Communication(e.to_string()))?;
        }

        // Envia comandos PPLA
        for cmd in &job.commands {
            let ppla_cmd = match cmd.command_type.as_str() {
                "text" => format!(
                    "A{},{},{},{},{},{},{},\"{}\"\r\n",
                    cmd.x,
                    cmd.y,
                    cmd.rotation,
                    cmd.font,
                    cmd.horizontal_multiplier,
                    cmd.vertical_multiplier,
                    if cmd.reverse { "R" } else { "N" },
                    cmd.text
                ),
                "barcode" => format!(
                    "B{},{},{},\"{}\"\r\n",
                    cmd.x,
                    cmd.y,
                    "2", // Código 128
                    cmd.text
                ),
                _ => continue,
            };

            port.write_all(ppla_cmd.as_bytes())
                .map_err(|e| PrinterError::Communication(e.to_string()))?;
        }

        // Imprime o número de cópias especificado
        port.write_all(format!("P{}\r\n", job.copies).as_bytes())
            .map_err(|e| PrinterError::Communication(e.to_string()))?;

        Ok(())
    }

    pub fn disconnect(&mut self) {
        self.port = None;
    }
}

#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports()
        .map_err(|e| e.to_string())?;
    
    Ok(ports.into_iter()
        .filter_map(|port| {
            if let SerialPortType::UsbPort(_) = port.port_type {
                Some(port.port_name)
            } else {
                None
            }
        })
        .collect())
}

#[tauri::command]
pub async fn print_product_label(
    product: crate::Product, 
    config: PrinterConfig,
    copies: u32
) -> Result<(), String> {
    let mut printer = PPLAPrinter::new(config.clone());
    
    printer.connect()
        .map_err(|e| e.to_string())?;

    let job = PrintJob {
        id: format!("job_{}", chrono::Utc::now().timestamp()),
        commands: vec![
            // Código de barras
            PPLACommand {
                command_type: "barcode".to_string(),
                x: 50,
                y: 10,
                rotation: 0,
                font: "".to_string(),
                horizontal_multiplier: 1,
                vertical_multiplier: 1,
                reverse: false,
                text: product.code.clone(),
            },
            // Nome do produto
            PPLACommand {
                command_type: "text".to_string(),
                x: 50,
                y: 50,
                rotation: 0,
                font: "3".to_string(),
                horizontal_multiplier: 1,
                vertical_multiplier: 1,
                reverse: false,
                text: product.name_short.clone(),
            },
            // Código do produto
            PPLACommand {
                command_type: "text".to_string(),
                x: 50,
                y: 80,
                rotation: 0,
                font: "2".to_string(),
                horizontal_multiplier: 1,
                vertical_multiplier: 1,
                reverse: false,
                text: product.code,
            },
        ],
        copies,
        status: PrintStatus::Pending,
    };

    printer.print(&job)
        .map_err(|e| e.to_string())?;

    printer.disconnect();
    Ok(())
}

#[tauri::command]
pub async fn test_printer_connection(config: PrinterConfig) -> Result<(), String> {
    let mut printer = PPLAPrinter::new(config);
    
    printer.connect()
        .map_err(|e| e.to_string())?;

    let test_job = PrintJob {
        id: "test".to_string(),
        commands: vec![
            PPLACommand {
                command_type: "text".to_string(),
                x: 50,
                y: 50,
                rotation: 0,
                font: "3".to_string(),
                horizontal_multiplier: 1,
                vertical_multiplier: 1,
                reverse: false,
                text: "Teste de Impressão".to_string(),
            },
        ],
        copies: 1,
        status: PrintStatus::Pending,
    };

    printer.print(&test_job)
        .map_err(|e| e.to_string())?;

    printer.disconnect();
    Ok(())
}

