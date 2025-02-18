"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { toast } from "@/components/ui/use-toast"
import { Printer, RefreshCcw } from 'lucide-react'

interface PrinterConfig {
  darkness: number
  width: number
  height: number
  speed: number
}

export default function ConfiguracaoPage() {
  const [loading, setLoading] = useState(false)
  const [printers, setPrinters] = useState<string[]>([])
  const [config, setConfig] = useState<PrinterConfig>({
    darkness: 8,
    width: 400,
    height: 240,
    speed: 2,
  })

  const searchPrinters = async () => {
    try {
      const found = await invoke<string[]>("list_printers")
      setPrinters(found)

      if (found.length === 0) {
        toast({
          variant: "destructive",
          title: "Atenção",
          description: "Nenhuma impressora Argox encontrada. Verifique se está conectada.",
        })
      }
    } catch (error) {
      console.error("Erro ao procurar impressoras:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao procurar impressoras: " + error,
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

  useEffect(() => {
    searchPrinters()
    loadSavedConfig()
  }, [])

  const connectPrinter = async () => {
    setLoading(true)
    try {
      await invoke("connect_printer", { config })
      await invoke("save_printer_settings", { config })
      
      toast({
        title: "Sucesso",
        description: "Impressora conectada com sucesso!",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao conectar impressora: " + error,
      })
    } finally {
      setLoading(false)
    }
  }

  const testPrint = async () => {
    try {
      await invoke("print_test")
      toast({
        title: "Sucesso",
        description: "Teste de impressão enviado com sucesso!",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao imprimir teste: " + error,
      })
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configuração da Impressora Argox OS-2140</h1>
        <Button 
          variant="outline" 
          onClick={searchPrinters}
          className="flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          Procurar Impressora
        </Button>
      </div>

      {printers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Impressora Encontrada</CardTitle>
            <CardDescription>
              {printers.join(", ")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Nenhuma Impressora</CardTitle>
            <CardDescription>
              Verifique se a impressora Argox OS-2140 está:
              <ul className="list-disc pl-4 mt-2">
                <li>Conectada via USB</li>
                <li>Ligada (LED verde aceso)</li>
                <li>Com papel instalado</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="test">Teste</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Impressão</CardTitle>
              <CardDescription>Ajuste os parâmetros de impressão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Densidade de Impressão</label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.darkness]}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, darkness: value[0] }))}
                    min={1}
                    max={15}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{config.darkness}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Velocidade</label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.speed]}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, speed: value[0] }))}
                    min={1}
                    max={4}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{config.speed}</span>
                </div>
              </div>

              <Button 
                onClick={connectPrinter} 
                disabled={loading || printers.length === 0}
                className="w-full"
              >
                {loading ? "Conectando..." : "Conectar e Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle>Teste de Impressão</CardTitle>
              <CardDescription>Imprima uma etiqueta de teste</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={testPrint}
                disabled={printers.length === 0}
                className="w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Teste
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}