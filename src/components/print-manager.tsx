"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "@/components/ui/use-toast"
import { Printer, RefreshCcw } from 'lucide-react'
import { PrinterConfig, PPLARequest, PPLAContentType } from "@/types/ppla"

export function PrintManager() {
  const [ports, setPorts] = useState<string[]>([])
  const [config, setConfig] = useState<PrinterConfig>({
    port: "",
    baud_rate: 9600,
    darkness: 8,
    width: 400,    // 50mm * 8 dots
    height: 240,   // 30mm * 8 dots
    speed: 2
  })
  const [isLoading, setIsLoading] = useState(false)

  const loadPorts = async () => {
    try {
      const availablePorts = await invoke<string[]>("list_serial_ports")
      setPorts(availablePorts)
      
      // Se encontrar portas, seleciona a primeira
      if (availablePorts.length > 0 && !config.port) {
        setConfig((prev: PrinterConfig) => ({ ...prev, port: availablePorts[0] }))
      }
    } catch (error) {
      console.error("Erro ao listar portas:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível listar as portas da impressora."
      })
    }
  }

  useEffect(() => {
    loadPorts()
    loadSavedConfig()
  }, [])

  const loadSavedConfig = async () => {
    try {
      const savedConfig = await invoke<PrinterConfig | null>("get_printer_settings")
      if (savedConfig) {
        setConfig(savedConfig)
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)
    }
  }

  const handleTestPrint = async () => {
    if (!config.port) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione uma porta da impressora"
      })
      return
    }

    setIsLoading(true)
    try {
      const ppla_request: PPLARequest = {
        config: {
          width: config.width,
          height: config.height,
          density: config.darkness,
          gap: 24,
          speed: config.speed
        },
        fields: [
          {
            x: 50,
            y: 50,
            content: "Teste de Impressão",
            field_type: PPLAContentType.Text,
            font_size: 3,
            horizontal_multiplier: 1,
            vertical_multiplier: 1
          },
          {
            x: 50,
            y: 100,
            content: new Date().toLocaleString(),
            field_type: PPLAContentType.Text,
            font_size: 2,
            horizontal_multiplier: 1,
            vertical_multiplier: 1
          }
        ],
        copies: 1
      }

      await invoke("test_printer_connection", { config })
      
      // Se o teste foi bem sucedido, salva as configurações
      await invoke("save_printer_settings", { config })
      
      toast({
        title: "Sucesso",
        description: "Teste de impressão realizado com sucesso!"
      })
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao realizar teste de impressão. Verifique a conexão com a impressora."
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Configuração da Impressora
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label>Porta da Impressora</Label>
            <Select
              value={config.port}
              onValueChange={(value) => setConfig((prev: PrinterConfig) => ({...prev, port: value}))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma porta" />
              </SelectTrigger>
              <SelectContent>
                {ports.map((port) => (
                  <SelectItem key={port} value={port}>
                    {port}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={loadPorts}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Velocidade (Baud Rate)</Label>
            <Select
              value={config.baud_rate.toString()}
              onValueChange={(value) => 
                setConfig((prev: PrinterConfig) => ({...prev, baud_rate: parseInt(value)}))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a velocidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9600">9600</SelectItem>
                <SelectItem value="19200">19200</SelectItem>
                <SelectItem value="38400">38400</SelectItem>
                <SelectItem value="57600">57600</SelectItem>
                <SelectItem value="115200">115200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Densidade (1-15)</Label>
            <Input
              type="number"
              min="1"
              max="15"
              value={config.darkness}
              onChange={(e) => 
                setConfig((prev: PrinterConfig) => ({...prev, darkness: parseInt(e.target.value)}))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Largura (dots)</Label>
            <Input
              type="number"
              value={config.width}
              onChange={(e) => 
                setConfig((prev: PrinterConfig) => ({...prev, width: parseInt(e.target.value)}))
              }
            />
            <p className="text-xs text-muted-foreground">
              8 dots = 1mm
            </p>
          </div>

          <div className="space-y-2">
            <Label>Altura (dots)</Label>
            <Input
              type="number"
              value={config.height}
              onChange={(e) => 
                setConfig((prev: PrinterConfig) => ({...prev, height: parseInt(e.target.value)}))
              }
            />
            <p className="text-xs text-muted-foreground">
              8 dots = 1mm
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Velocidade de Impressão (1-4)</Label>
          <Select
            value={config.speed?.toString() || "2"}
            onValueChange={(value) => 
              setConfig((prev: PrinterConfig) => ({...prev, speed: parseInt(value)}))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a velocidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Lenta</SelectItem>
              <SelectItem value="2">2 - Normal</SelectItem>
              <SelectItem value="3">3 - Rápida</SelectItem>
              <SelectItem value="4">4 - Muito Rápida</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          className="w-full" 
          onClick={handleTestPrint}
          disabled={isLoading}
        >
          {isLoading ? "Imprimindo..." : "Testar Impressora"}
        </Button>
      </CardContent>
    </Card>
  )
}

