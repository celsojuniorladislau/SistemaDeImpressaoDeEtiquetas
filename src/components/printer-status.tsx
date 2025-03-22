"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Printer, WifiOff } from 'lucide-react'
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
    lastConnection: null
  })

  const checkPrinterConnection = async () => {
    try {
      // Verificar se existe impressora conectada
      const isConnected = await invoke<boolean>("is_printer_connected")
      
      const settings = await invoke<{ port: string } | null>("get_printer_settings")
      const port = settings?.port || "Não configurada"
      
      setStatus({
        isConnected,
        port,
        lastConnection: isConnected ? new Date().toLocaleString() : null
      })
    } catch (error) {
      console.error("Erro ao verificar status da impressora:", error)
      setStatus({
        isConnected: false,
        port: "Erro",
        lastConnection: null
      })
    }
  }

  useEffect(() => {
    checkPrinterConnection()
    // Verifica a conexão a cada 30 segundos
    const interval = setInterval(checkPrinterConnection, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Status da Impressora</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {status.isConnected ? (
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
          </div>
          <div 
            className={cn(
              "h-3 w-3 rounded-full", 
              status.isConnected ? "bg-green-500" : "bg-red-500"
            )} 
          />
        </div>
      </CardContent>
    </Card>
  )
}