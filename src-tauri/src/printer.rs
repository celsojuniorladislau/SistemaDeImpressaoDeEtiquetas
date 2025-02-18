use rusb::{Context, Device, DeviceHandle, UsbContext};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Constantes da Argox OS-2140
const ARGOX_VID: u16 = 0x1CBE;
const ARGOX_PID: u16 = 0x0002;
const TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterConfig {
    pub darkness: u8,      // Densidade de impressão (1-15)
    pub width: u32,        // Largura em dots (8 dots = 1mm)
    pub height: u32,       // Altura em dots
    pub speed: u8,         // Velocidade (1-4)
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

pub struct UsbPrinter {
    handle: DeviceHandle<Context>,
    endpoint_out: u8,
    endpoint_in: u8,
    config: PrinterConfig,
}

impl UsbPrinter {
    pub fn new(config: PrinterConfig) -> Result<Self, String> {
        let context = Context::new()
            .map_err(|e| format!("Erro ao criar contexto USB: {}", e))?;

        // Procura a impressora Argox
        let (device, device_desc) = context
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

        // Configura a impressora
        let mut handle = device
            .open()
            .map_err(|e| format!("Erro ao abrir dispositivo: {}", e))?;

        // Reset do dispositivo
        handle
            .reset()
            .map_err(|e| format!("Erro ao resetar dispositivo: {}", e))?;

        // Encontra os endpoints
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

        // Configura a interface
        handle
            .claim_interface(interface_desc.interface_number())
            .map_err(|e| format!("Erro ao configurar interface: {}", e))?;

        // Encontra endpoints
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

    pub fn write(&self, data: &[u8]) -> Result<usize, String> {
        self.handle
            .write_bulk(self.endpoint_out, data, TIMEOUT)
            .map_err(|e| format!("Erro ao enviar dados: {}", e))
    }

    pub fn read(&self, buffer: &mut [u8]) -> Result<usize, String> {
        self.handle
            .read_bulk(self.endpoint_in, buffer, TIMEOUT)
            .map_err(|e| format!("Erro ao ler dados: {}", e))
    }

    pub fn print_label(&self, text: &str) -> Result<(), String> {
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

    pub fn test_connection(&self) -> Result<(), String> {
        // Envia comando de status
        self.write(b"~H\r\n")?;
        
        // Lê resposta
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
pub static PRINTER: Lazy<Mutex<Option<UsbPrinter>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub async fn connect_printer(config: PrinterConfig) -> Result<(), String> {
    let printer = UsbPrinter::new(config)?;
    
    // Testa a conexão
    printer.test_connection()?;
    
    // Se chegou aqui, salva a impressora no estado global
    let mut printer_guard = PRINTER.lock().unwrap();
    *printer_guard = Some(printer);
    
    Ok(())
}

#[tauri::command]
pub async fn print_test() -> Result<(), String> {
    let printer_guard = PRINTER.lock().unwrap();
    
    if let Some(printer) = &*printer_guard {
        printer.print_label("Teste de Impressão")?;
        Ok(())
    } else {
        Err("Impressora não conectada".to_string())
    }
}

#[tauri::command]
pub async fn list_printers() -> Result<Vec<String>, String> {
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