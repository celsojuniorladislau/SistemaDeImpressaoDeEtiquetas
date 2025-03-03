"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Printer, RefreshCcw, Settings, AlertCircle, Info } from "lucide-react"
import { getVersion } from "@tauri-apps/api/app"

interface PrinterConfig {
  darkness: number
  width: number
  height: number
  speed: number
}

export default function ConfiguracaoPage() {
  const [loading, setLoading] = useState(false)
  const [printers, setPrinters] = useState<string[]>([])
  const [version, setVersion] = useState<string>("")
  const [config, setConfig] = useState<PrinterConfig>({
    darkness: 8,
    width: 400,
    height: 240,
    speed: 2,
  })
  const [debugInfo, setDebugInfo] = useState<string>("")

  const searchPrinters = async () => {
    setDebugInfo("Procurando impressoras...")
    try {
      const found = await invoke<string[]>("list_printers")
      setPrinters(found)
      setDebugInfo(`Impressoras encontradas: ${found.join(", ")}`)

      if (found.length === 0) {
        toast.error("Nenhuma impressora Argox encontrada", {
          description: "Verifique se está conectada e ligada.",
        })
      } else {
        toast.success("Impressora encontrada!", {
          description: found[0],
        })
      }
    } catch (error) {
      console.error("Erro ao procurar impressoras:", error)
      setDebugInfo(`Erro: ${error}`)
      toast.error("Erro ao procurar impressoras", {
        description: String(error),
      })
    }
  }

  const loadSavedConfig = async () => {
    try {
      const savedConfig = await invoke<PrinterConfig | null>("get_printer_settings")
      if (savedConfig) {
        setConfig(savedConfig)
        setDebugInfo("Configurações carregadas com sucesso")
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)
      setDebugInfo(`Erro ao carregar configurações: ${error}`)
    }
  }

  useEffect(() => {
    searchPrinters()
    loadSavedConfig()

    // Carregar versão do sistema
    async function loadVersion() {
      try {
        const version = await getVersion()
        setVersion(version)
      } catch (error) {
        console.error("Erro ao carregar versão:", error)
        setDebugInfo((prev) => `${prev}\nErro ao carregar versão: ${error}`)
      }
    }
    loadVersion()
  }, []) // Removed dependencies to useEffect

  const connectPrinter = async () => {
    setLoading(true)
    setDebugInfo("Tentando conectar à impressora...")
    try {
      await invoke("connect_printer", { config })
      await invoke("save_printer_settings", { config })

      setDebugInfo("Impressora conectada e configurações salvas")
      toast.success("Impressora conectada!", {
        description: "Configurações salvas com sucesso.",
      })
    } catch (error) {
      setDebugInfo(`Erro na conexão: ${error}`)
      toast.error("Erro ao conectar impressora", {
        description: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const testPrint = async () => {
    setDebugInfo("Enviando teste de impressão...")
    try {
      await invoke("print_test")
      setDebugInfo("Teste de impressão enviado com sucesso")
      toast.success("Teste enviado!", {
        description: "Verifique a impressora",
      })
    } catch (error) {
      setDebugInfo(`Erro no teste: ${error}`)
      toast.error("Erro ao imprimir teste", {
        description: String(error),
      })
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuração da Impressora Argox OS-2140</h1>
        </div>
        <Button variant="outline" onClick={searchPrinters} className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" />
          Procurar Impressora
        </Button>
      </div>

      {printers.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-green-500" />
              <CardTitle>Impressora Encontrada</CardTitle>
            </div>
            <CardDescription>{printers.join(", ")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">Nenhuma Impressora</CardTitle>
            </div>
            <CardDescription>
              Verifique se a impressora Argox OS-2140 está:
              <ul className="list-disc pl-4 mt-2">
                <li>Conectada via USB</li>
                <li>Ligada (LED verde aceso)</li>
                <li>Com papel instalado</li>
                <li>Driver USB instalado corretamente</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Teste
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Sistema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Impressão</CardTitle>
              <CardDescription>Ajuste os parâmetros de impressão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Densidade de Impressão</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.darkness]}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, darkness: value[0] }))}
                    min={1}
                    max={15}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{config.darkness}</span>
                </div>
                <p className="text-sm text-muted-foreground">Ajusta o contraste da impressão (1-15)</p>
              </div>

              <div className="space-y-2">
                <Label>Velocidade</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.speed]}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, speed: value[0] }))}
                    min={1}
                    max={4}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{config.speed}</span>
                </div>
                <p className="text-sm text-muted-foreground">Velocidade de impressão (1-4)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Largura (dots)</Label>
                  <Input
                    type="number"
                    value={config.width}
                    onChange={(e) => setConfig((prev) => ({ ...prev, width: Number.parseInt(e.target.value) || 0 }))}
                    min={0}
                  />
                  <p className="text-sm text-muted-foreground">8 dots = 1mm</p>
                </div>

                <div className="space-y-2">
                  <Label>Altura (dots)</Label>
                  <Input
                    type="number"
                    value={config.height}
                    onChange={(e) => setConfig((prev) => ({ ...prev, height: Number.parseInt(e.target.value) || 0 }))}
                    min={0}
                  />
                  <p className="text-sm text-muted-foreground">8 dots = 1mm</p>
                </div>
              </div>

              <Button onClick={connectPrinter} disabled={loading || printers.length === 0} className="w-full">
                {loading ? "Conectando..." : "Conectar e Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle>Teste de Impressão</CardTitle>
              <CardDescription>Imprima uma etiqueta de teste para verificar as configurações</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={testPrint} disabled={printers.length === 0} className="w-full">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Teste
              </Button>

              {debugInfo && (
                <Card className="bg-muted">
                  <CardContent className="p-4">
                    <pre className="text-sm whitespace-pre-wrap">{debugInfo}</pre>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Sistema</CardTitle>
              <CardDescription>Detalhes sobre a versão e configuração do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Versão do Sistema</span>
                  <span className="font-medium">{version || "Carregando..."}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Status da Impressora</span>
                  <span className={`font-medium ${printers.length > 0 ? "text-green-500" : "text-destructive"}`}>
                    {printers.length > 0 ? "Conectada" : "Desconectada"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Impressora Detectada</span>
                  <span className="font-medium">{printers[0] || "Nenhuma"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

