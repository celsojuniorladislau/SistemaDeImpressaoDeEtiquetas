use std::ffi::OsStr;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use tempfile::NamedTempFile;
use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, HANDLE, GetLastError, BOOL};
use windows_sys::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
    PRINTER_ENUM_LOCAL, PRINTER_ENUM_CONNECTIONS,
};

// Definição da estrutura PRINTER_INFO_2W
#[repr(C)]
struct PRINTER_INFO_2W {
    pServerName: *const u16,
    pPrinterName: *const u16,
    pShareName: *const u16,
    pPortName: *const u16,
    pDriverName: *const u16,
    pComment: *const u16,
    pLocation: *const u16,
    pDevMode: *const u8,
    pSepFile: *const u16,
    pPrintProcessor: *const u16,
    pDatatype: *const u16,
    pParameters: *const u16,
    pSecurityDescriptor: *const u8,
    Attributes: u32,
    Priority: u32,
    DefaultPriority: u32,
    StartTime: u32,
    UntilTime: u32,
    Status: u32,
    cJobs: u32,
    AveragePPM: u32,
}

// Declare as funções ausentes manualmente
extern "system" {
    fn OpenPrinterW(
        pPrinterName: *const u16,
        phPrinter: *mut HANDLE,
        pDefault: *const ::core::ffi::c_void,
    ) -> BOOL;
    
    fn EnumPrintersW(
        Flags: u32,
        Name: *const u16,
        Level: u32,
        pPrinterEnum: *mut u8,
        cbBuf: u32,
        pcbNeeded: *mut u32,
        pcReturned: *mut u32,
    ) -> BOOL;
}

// Converte uma string Rust para uma wide string do Windows
fn to_wide_string(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

// Função principal para imprimir usando a API do Windows
pub fn print_to_windows_printer(
    printer_name: &str,
    document_name: &str,
    data: &[u8],
) -> Result<(), String> {
    // Converte nomes para formato Windows
    let mut printer_name_wide = to_wide_string(printer_name);
    let mut document_name_wide = to_wide_string(document_name);
    let mut datatype_wide = to_wide_string("RAW");

    unsafe {
        // Abre a impressora
        let mut printer_handle: HANDLE = std::ptr::null_mut();
        let result = OpenPrinterW(
            printer_name_wide.as_mut_ptr(),
            &mut printer_handle,
            std::ptr::null(),
        );

        if result == 0 {
            return Err(format!(
                "Falha ao abrir impressora '{}'. Erro: {}",
                printer_name,
                std::io::Error::last_os_error()
            ));
        }

        // Configura o documento
        let mut doc_info = DOC_INFO_1W {
            pDocName: document_name_wide.as_mut_ptr(),
            pOutputFile: std::ptr::null_mut(),
            pDatatype: datatype_wide.as_mut_ptr(),
        };

        let job_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as _);
        if job_id <= 0 {
            ClosePrinter(printer_handle);
            return Err(format!(
                "Falha ao iniciar documento. Erro: {}",
                std::io::Error::last_os_error()
            ));
        }

        // Inicia a página
        let result = StartPagePrinter(printer_handle);
        if result == 0 {
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!(
                "Falha ao iniciar página. Erro: {}",
                std::io::Error::last_os_error()
            ));
        }

        // Escreve os dados para a impressora
        let mut bytes_written: u32 = 0;
        let result = WritePrinter(
            printer_handle,
            data.as_ptr() as _,
            data.len() as u32,
            &mut bytes_written,
        );

        if result == 0 || bytes_written != data.len() as u32 {
            EndPagePrinter(printer_handle);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!(
                "Falha ao escrever para a impressora. Erro: {}",
                std::io::Error::last_os_error()
            ));
        }

        // Finaliza a impressão
        EndPagePrinter(printer_handle);
        EndDocPrinter(printer_handle);
        ClosePrinter(printer_handle);

        Ok(())
    }
}

// Função alternativa usando o comando de sistema
pub fn print_using_system_command(
    printer_name: &str,
    data: &[u8],
) -> Result<(), String> {
    // Cria um arquivo temporário
    let mut temp_file = NamedTempFile::new()
        .map_err(|e| format!("Erro ao criar arquivo temporário: {}", e))?;
    
    // Escreve os dados no arquivo
    temp_file
        .write_all(data)
        .map_err(|e| format!("Erro ao escrever no arquivo temporário: {}", e))?;
    
    // Obtém o caminho do arquivo
    let file_path = temp_file.path().to_string_lossy().to_string();
    
    // Usa o comando copy para imprimir
    let status = std::process::Command::new("cmd.exe")
        .args(&[
            "/C",
            &format!("copy /b \"{}\" \"{}\"", file_path, printer_name),
        ])
        .status()
        .map_err(|e| format!("Erro ao executar comando: {}", e))?;
    
    if !status.success() {
        return Err(format!(
            "Comando de impressão falhou com código: {:?}",
            status.code()
        ));
    }
    
    Ok(())
}

// Função para extrair uma string wide de um ponteiro
unsafe fn wide_ptr_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    
    let mut length = 0;
    while *ptr.add(length) != 0 {
        length += 1;
    }
    
    let slice = std::slice::from_raw_parts(ptr, length);
    String::from_utf16_lossy(slice)
}

// Lista as impressoras disponíveis no sistema usando EnumPrinters
pub fn list_windows_printers() -> Result<Vec<String>, String> {
    unsafe {
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        
        // Primeira chamada para obter o tamanho do buffer necessário
        let result = EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            std::ptr::null(),
            2, // Level 2 contém informações detalhadas
            std::ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        );
        
        // Se a função falhar por outro motivo que não seja buffer insuficiente
        if result == 0 && GetLastError() != ERROR_INSUFFICIENT_BUFFER {
            return Err(format!(
                "Falha ao enumerar impressoras. Erro: {}",
                std::io::Error::last_os_error()
            ));
        }
        
        // Aloca o buffer com o tamanho necessário
        let mut buffer = vec![0u8; needed as usize];
        
        // Segunda chamada com o buffer alocado
        let result = EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            std::ptr::null(),
            2,
            buffer.as_mut_ptr(),
            needed,
            &mut needed,
            &mut returned,
        );
        
        if result == 0 {
            return Err(format!(
                "Falha ao enumerar impressoras. Erro: {}",
                std::io::Error::last_os_error()
            ));
        }
        
        // Converte o buffer em uma slice de PRINTER_INFO_2W
        let printer_info = buffer.as_ptr() as *const PRINTER_INFO_2W;
        let printer_info_slice = std::slice::from_raw_parts(printer_info, returned as usize);
        
        // Extrai os nomes das impressoras
        let mut printers = Vec::new();
        for info in printer_info_slice {
            let name = wide_ptr_to_string(info.pPrinterName);
            if !name.is_empty() {
                printers.push(name);
            }
        }
        
        Ok(printers)
    }
}

// Versão silenciosa é a mesma, já que EnumPrinters não mostra UI
pub fn list_windows_printers_silent() -> Result<Vec<String>, String> {
    list_windows_printers()
}

