"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Printer, RefreshCcw, Settings, AlertCircle, Save } from "lucide-react"
import { getVersion } from "@tauri-apps/api/app"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePrinter } from "@/contexts/printer-context"
import { toast } from "sonner"

export default function ConfiguracaoPage() {
  const {
    printers,
    selectedPrinter,
    setSelectedPrinter,
    config,
    updateConfig,
    loading,
    searchPrinters,
    saveConfig,
    testPrint,
  } = usePrinter()

  const [version, setVersion] = useState<string>("")
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [localSelectedPrinter, setLocalSelectedPrinter] = useState<string>("")

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const v = await getVersion()
        setVersion(v)
      } catch (error) {
        console.error("Erro ao obter versão:", error)
      }
    }

    loadVersion()

    // Atualizar o estado local quando o selectedPrinter do contexto mudar
    if (selectedPrinter) {
      setLocalSelectedPrinter(selectedPrinter)
      setDebugInfo(`Impressora atual: ${selectedPrinter}`)
    }
  }, [selectedPrinter])

  const handlePrinterChange = (value: string) => {
    setLocalSelectedPrinter(value)
    setSelectedPrinter(value)
    setDebugInfo(`Impressora selecionada: ${value}`)

    // Mostrar toast de confirmação
    toast.success("Impressora selecionada", {
      description: `${value} definida como impressora padrão`,
    })

    // Salvar imediatamente a seleção
    localStorage.setItem("selectedPrinter", value)
  }

  const handleTestPrint = async () => {
    setDebugInfo(`Enviando teste de impressão para ${selectedPrinter}...`)
    await testPrint()
    setDebugInfo("Teste de impressão enviado com sucesso")
  }

  const handleSaveConfig = async () => {
    setDebugInfo("Salvando configurações...")
    await saveConfig()
    setDebugInfo("Configurações salvas com sucesso")
  }

  const handleRefreshPrinters = async () => {
    setDebugInfo("Procurando impressoras no Windows...")
    await searchPrinters(true, true)
    setDebugInfo(`Impressoras encontradas: ${printers.join(", ")}`)
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuração da Impressora</h1>
        </div>
        <Button
          variant="outline"
          onClick={handleRefreshPrinters}
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          {loading ? "Atualizando..." : "Atualizar Lista"}
        </Button>
      </div>

      {loading && printers.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Carregando configurações...</p>
            </div>
          </CardContent>
        </Card>
      ) : printers.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-green-500" />
              <CardTitle>Impressoras Disponíveis</CardTitle>
            </div>
            <CardDescription>Selecione a impressora que deseja usar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={localSelectedPrinter} onValueChange={handlePrinterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma impressora" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer} value={printer}>
                    {printer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status da Impressora */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <span className={`text-sm font-medium ${localSelectedPrinter ? "text-green-500" : "text-destructive"}`}>
                  {localSelectedPrinter ? "Impressora Conectada" : "Nenhuma Impressora Selecionada"}
                </span>
              </div>
              {localSelectedPrinter && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-xs text-muted-foreground">Usando: {localSelectedPrinter}</span>
                </div>
              )}
            </div>
          </CardContent>
          {/* <CardFooter>
            <Button
              onClick={() => saveConfig()}
              disabled={!localSelectedPrinter}
              className="w-full"
              variant="secondary"
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Impressora Selecionada
            </Button>
          </CardFooter> */}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">Nenhuma Impressora</CardTitle>
            </div>
            <CardDescription>
              Verifique se a impressora está:
              <ul className="list-disc pl-4 mt-2">
                <li>Instalada no Windows corretamente</li>
                <li>Ligada (LED verde aceso)</li>
                <li>Com papel instalado</li>
                <li>Driver instalado corretamente</li>
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
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Impressão</CardTitle>
              <CardDescription>
                Ajuste os parâmetros de impressão para a impressora do Windows. A impressora selecionada é configurada
                automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Densidade de Impressão</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.darkness]}
                    onValueChange={(value) => updateConfig({ darkness: value[0] })}
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
                    onValueChange={(value) => updateConfig({ speed: value[0] })}
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
                    onChange={(e) => updateConfig({ width: Number.parseInt(e.target.value) || 0 })}
                    min={0}
                  />
                  <p className="text-sm text-muted-foreground">8 dots = 1mm</p>
                </div>

                <div className="space-y-2">
                  <Label>Altura (dots)</Label>
                  <Input
                    type="number"
                    value={config.height}
                    onChange={(e) => updateConfig({ height: Number.parseInt(e.target.value) || 0 })}
                    min={0}
                  />
                  <p className="text-sm text-muted-foreground">8 dots = 1mm</p>
                </div>
              </div>

              <Button
                onClick={handleSaveConfig}
                disabled={loading || printers.length === 0 || !localSelectedPrinter}
                className="w-full"
              >
                {loading ? "Salvando..." : "Atualizar Configurações de Impressão"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                As alterações de densidade, velocidade e dimensões precisam ser confirmadas pelo botão acima. A seleção
                da impressora é salva automaticamente.
              </p>
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
              <Button
                onClick={handleTestPrint}
                disabled={printers.length === 0 || !localSelectedPrinter}
                className="w-full"
              >
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
      </Tabs>

      <div className="text-xs text-muted-foreground mt-8 text-right">Versão: {version || "Carregando..."}</div>
    </div>
  )
}
