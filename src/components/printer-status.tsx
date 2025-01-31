"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Printer, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface PrinterStatus {
  isConnected: boolean
  port: string
  lastConnection: string | null
}

export function PrinterStatus() {
  const [status, setStatus] = useState<PrinterStatus>({
    isConnected: false,
    port: "",
    lastConnection: null,
  })

  const checkPrinterConnection = async () => {
    try {
      const settings = await invoke<{ port: string } | null>("get_printer_settings")
      if (!settings) {
        setStatus((prev) => ({ ...prev, isConnected: false }))
        return
      }

      await invoke("test_printer_connection", { config: settings })
      setStatus({
        isConnected: true,
        port: settings.port,
        lastConnection: new Date().toLocaleString(),
      })
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isConnected: false,
        lastConnection: prev.lastConnection, // Mantém o último horário de conexão
      }))
    }
  }

  useEffect(() => {
    checkPrinterConnection()
    // Verifica a conexão a cada 30 segundos
    const interval = setInterval(checkPrinterConnection, 30000)
    return () => clearInterval(interval)
  }, [checkPrinterConnection]) // Added checkPrinterConnection to dependencies

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Status da Impressora</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {status.isConnected ? (
                <span className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Conectada
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4" />
                  Desconectada
                </span>
              )}
            </p>
            {status.port && <p className="text-xs text-muted-foreground">Porta: {status.port}</p>}
            {status.lastConnection && (
              <p className="text-xs text-muted-foreground">Última conexão: {status.lastConnection}</p>
            )}
          </div>
          <div className={cn("h-3 w-3 rounded-full", status.isConnected ? "bg-green-500" : "bg-red-500")} />
        </div>
      </CardContent>
    </Card>
  )
}

