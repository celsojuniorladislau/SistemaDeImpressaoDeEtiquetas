"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Printer, RefreshCcw } from "lucide-react"
import { PrinterStatus } from "@/components/printer-status"

interface PrinterConfig {
  port: string
  baud_rate: number
  density: number
  width: number
  height: number
  speed: number
}

export default function ConfiguracaoPage() {
  const [ports, setPorts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<PrinterConfig>({
    port: "",
    baud_rate: 9600,
    density: 8,
    width: 400,
    height: 240,
    speed: 2,
  })

  useEffect(() => {
    loadPorts()
    loadSavedConfig()
  }, [])

  const loadPorts = async () => {
    try {
      const availablePorts = await invoke<string[]>("list_serial_ports")
      setPorts(availablePorts)

      // Se encontrar portas, seleciona a primeira
      if (availablePorts.length > 0 && !config.port) {
        setConfig((prev) => ({ ...prev, port: availablePorts[0] }))
      }
    } catch (error) {
      console.error("Erro ao listar portas:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível listar as portas da impressora.",
      })
    }
  }

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
        description: "Selecione uma porta da impressora",
      })
      return
    }

    setLoading(true)
    try {
      await invoke("test_printer_connection", { config })

      // Se o teste foi bem sucedido, salva as configurações
      await invoke("save_printer_settings", { config })

      toast({
        title: "Sucesso",
        description: "Teste de impressão realizado com sucesso!",
      })
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao realizar teste de impressão. Verifique a conexão com a impressora.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configuração da Impressora</h1>
      </div>

      {/* Adicionado o componente PrinterStatus */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <PrinterStatus />
      </div>

      <Tabs defaultValue="connection" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connection">Conexão</TabsTrigger>
          <TabsTrigger value="defaults">Padrões de Impressão</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Conexão</CardTitle>
              <CardDescription>Configure os parâmetros de conexão com a impressora térmica.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Porta da Impressora</Label>
                  <Select
                    value={config.port}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, port: value }))}
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
                <Button variant="outline" size="icon" onClick={loadPorts}>
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Velocidade (Baud Rate)</Label>
                <Select
                  value={config.baud_rate.toString()}
                  onValueChange={(value) => setConfig((prev) => ({ ...prev, baud_rate: Number.parseInt(value) }))}
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
                <p className="text-sm text-muted-foreground">
                  Velocidade de comunicação com a impressora. Geralmente 9600.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defaults" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Padrão de Impressão das Etiquetas</CardTitle>
              <CardDescription>Define os valores padrão para densidade e velocidade de impressão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Densidade de Impressão Padrão</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.density]}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, density: value[0] }))}
                    min={1}
                    max={15}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{config.density}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ajusta o contraste padrão da impressão (1-15). Valores mais altos resultam em impressão mais escura.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Velocidade de Impressão Padrão</Label>
                <Select
                  value={config.speed.toString()}
                  onValueChange={(value) => setConfig((prev) => ({ ...prev, speed: Number.parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a velocidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Lenta (Maior Qualidade)</SelectItem>
                    <SelectItem value="2">2 - Normal</SelectItem>
                    <SelectItem value="3">3 - Rápida</SelectItem>
                    <SelectItem value="4">4 - Muito Rápida</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Velocidade padrão de impressão. Velocidades mais baixas geralmente resultam em melhor qualidade.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Largura Padrão (dots)</Label>
                  <Input
                    type="number"
                    value={config.width}
                    onChange={(e) => setConfig((prev) => ({ ...prev, width: Number.parseInt(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">8 dots = 1mm</p>
                </div>

                <div className="space-y-2">
                  <Label>Altura Padrão (dots)</Label>
                  <Input
                    type="number"
                    value={config.height}
                    onChange={(e) => setConfig((prev) => ({ ...prev, height: Number.parseInt(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">8 dots = 1mm</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Teste de Impressão</CardTitle>
          <CardDescription>Realiza um teste de impressão com as configurações atuais.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleTestPrint} disabled={loading || !config.port} className="w-full">
            <Printer className="mr-2 h-4 w-4" />
            {loading ? "Imprimindo..." : "Imprimir Teste"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

