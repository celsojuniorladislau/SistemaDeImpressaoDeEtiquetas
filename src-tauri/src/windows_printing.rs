use std::ffi::OsStr;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use tempfile::NamedTempFile;
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
};

// Declare as funções ausentes manualmente
extern "system" {
    fn OpenPrinterW(
        pPrinterName: *const u16,
        phPrinter: *mut HANDLE,
        pDefault: *const ::core::ffi::c_void,
    ) -> u32;
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
            pDatatype: std::ptr::null_mut(),
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

// Lista as impressoras disponíveis no sistema
pub fn list_windows_printers() -> Result<Vec<String>, String> {
    // Esta é uma implementação simplificada
    // Para uma implementação completa, você precisaria usar EnumPrinters
    
    // Por enquanto, vamos usar um comando do sistema
    let output = std::process::Command::new("powershell.exe")
        .args(&["-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
        .output()
        .map_err(|e| format!("Erro ao listar impressoras: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let printers = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    
    Ok(printers)
}