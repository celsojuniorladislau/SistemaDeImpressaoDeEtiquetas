"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Printer, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from "@/lib/utils"

interface PrinterStatus {
  isConnected: boolean
  port: string
  lastConnection: string | null
  isMock: boolean // Adicione esta propriedade
}

export function PrinterStatus() {
  const [status, setStatus] = useState<PrinterStatus>({
    isConnected: false,
    port: "",
    lastConnection: null,
    isMock: false // Inicialize como false
  })

  const checkPrinterConnection = async () => {
    try {
      // Verificar se está usando impressora simulada
      const isMock = await invoke<boolean>("is_printer_mock")
      
      const settings = await invoke<{ port: string } | null>("get_printer_settings")
      if (!settings) {
        setStatus((prev) => ({ ...prev, isConnected: false, isMock }))
        return
      }

      // Se estiver em modo simulado, não precisa testar a conexão
      if (isMock) {
        setStatus({
          isConnected: true,
          port: "Simulada",
          lastConnection: new Date().toLocaleString(),
          isMock: true
        })
        return
      }

      await invoke("test_printer_connection", { config: settings })
      setStatus({
        isConnected: true,
        port: settings.port,
        lastConnection: new Date().toLocaleString(),
        isMock: false
      })
    } catch (error) {
      // Verificar se está usando impressora simulada mesmo se houver erro
      try {
        const isMock = await invoke<boolean>("is_printer_mock")
        setStatus((prev) => ({
          ...prev,
          isConnected: isMock, // Se for mock, consideramos conectada
          isMock,
          lastConnection: prev.lastConnection, // Mantém o último horário de conexão
        }))
      } catch {
        setStatus((prev) => ({
          ...prev,
          isConnected: false,
          isMock: false,
          lastConnection: prev.lastConnection,
        }))
      }
    }
  }

  useEffect(() => {
    checkPrinterConnection()
    // Verifica a conexão a cada 30 segundos
    const interval = setInterval(checkPrinterConnection, 30000)
    return () => clearInterval(interval)
  }, []) // Remova checkPrinterConnection das dependências para evitar loops

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Status da Impressora</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {status.isMock ? (
              <p className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Modo Simulado
                </span>
              </p>
            ) : status.isConnected ? (
              <p className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Conectada
                </span>
              </p>
            ) : (
              <p className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4" />
                  Desconectada
                </span>
              </p>
            )}
            {status.port && <p className="text-xs text-muted-foreground">Porta: {status.port}</p>}
            {status.lastConnection && (
              <p className="text-xs text-muted-foreground">Última conexão: {status.lastConnection}</p>
            )}
            {status.isMock && (
              <p className="text-xs text-amber-600">
                Sistema operando com impressora simulada. As operações de impressão serão registradas no console.
              </p>
            )}
          </div>
          <div 
            className={cn(
              "h-3 w-3 rounded-full", 
              status.isMock 
                ? "bg-amber-500" 
                : status.isConnected 
                  ? "bg-green-500" 
                  : "bg-red-500"
            )} 
          />
        </div>
      </CardContent>
    </Card>
  )
}