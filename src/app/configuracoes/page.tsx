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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PrinterConfig {
  darkness: number
  width: number
  height: number
  speed: number
  port: string
  selectedPrinter?: string
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
    port: "Windows",
  })
  const [selectedPrinter, setSelectedPrinter] = useState<string>("")
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)

  // Função para processar impressoras e atualizar estados
  const processPrinters = (found: string[]) => {
    setPrinters(found);
    setDebugInfo(`Impressoras encontradas: ${found.join(", ")}`);
    
    // Se houver impressoras e nenhuma estiver selecionada, selecione a primeira
    if (!selectedPrinter && found.length > 0) {
      setSelectedPrinter(found[0]);
    }
    
    // Salvar no localStorage para evitar consultas desnecessárias
    try {
      localStorage.setItem('cachedPrinters', JSON.stringify(found));
      localStorage.setItem('printersCacheTime', Date.now().toString());
    } catch (error) {
      console.error("Erro ao salvar cache de impressoras:", error);
    }
  };

  const searchPrinters = async (showToasts = true, silent = false) => {
    if (!silent) {
      setDebugInfo("Procurando impressoras no Windows...");
    }
    
    // Primeiro tenta mostrar as impressoras em cache enquanto carrega
    try {
      const cachedPrinters = localStorage.getItem('cachedPrinters');
      const cacheTime = localStorage.getItem('printersCacheTime');
      
      // Se tiver um cache recente (menos de 5 minutos), use-o inicialmente
      const cacheAgeMs = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;
      if (cachedPrinters && cacheAgeMs < 5 * 60 * 1000) {
        const cached = JSON.parse(cachedPrinters);
        if (Array.isArray(cached) && cached.length > 0) {
          processPrinters(cached);
          // Se o cache for muito recente (menos de 30 segundos), nem faz nova busca
          if (cacheAgeMs < 30 * 1000 && !showToasts) {
            return;
          }
        }
      }
    } catch (error) {
      console.error("Erro ao acessar cache:", error);
    }
    
    try {
      // Adicionar parâmetro para solicitar operação silenciosa que não cause flash de tela
      const found = await invoke<string[]>("list_printers", { silent: true });
      processPrinters(found);
      
      if (found.length === 0) {
        if (showToasts) {
          toast.error("Nenhuma impressora encontrada no Windows", {
            description: "Instale uma impressora no Windows para continuar.",
          });
        }
      } else if (showToasts) {
        toast.success("Impressoras encontradas!", {
          description: `${found.length} impressora(s) disponível(is)`,
        });
      }
    } catch (error) {
      console.error("Erro ao procurar impressoras:", error);
      setDebugInfo(`Erro: ${error}`);
      if (showToasts) {
        toast.error("Erro ao procurar impressoras", {
          description: String(error),
        });
      }
    }
  };

  const loadSavedConfig = async () => {
    setLoadingConfig(true)
    try {
      const savedConfig = await invoke<PrinterConfig | null>("get_printer_settings")
      if (savedConfig) {
        setConfig(savedConfig)
        // Se houver uma impressora salva nas configurações, selecione-a
        if (savedConfig.selectedPrinter) {
          setSelectedPrinter(savedConfig.selectedPrinter)
        }
        setDebugInfo("Configurações carregadas com sucesso")
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)
      setDebugInfo(`Erro ao carregar configurações: ${error}`)
    } finally {
      setLoadingConfig(false)
    }
  }

  const testPrint = async () => {
    if (!selectedPrinter) {
      toast.error("Nenhuma impressora selecionada", {
        description: "Selecione uma impressora primeiro",
      })
      return
    }
    
    setDebugInfo(`Enviando teste de impressão para ${selectedPrinter}...`)
    try {
      await invoke("print_test", { printerName: selectedPrinter })
      
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const v = await getVersion();
        setVersion(v);
      } catch (error) {
        console.error("Erro ao obter versão:", error);
      }

      // Carregar configuração e impressoras em paralelo para melhor desempenho
      await Promise.all([
        loadSavedConfig(),
        searchPrinters(false)
      ]);
      
      setInitialLoad(false);
    };

    loadData();
    
    // Este efeito deve executar apenas uma vez na montagem do componente
  }, []);

  const saveConfig = async () => {
    if (!selectedPrinter) {
      toast.error("Nenhuma impressora selecionada", {
        description: "Selecione uma impressora primeiro",
      })
      return
    }
    
    setLoading(true)
    setDebugInfo("Salvando configurações...")
    try {
      // Criar objeto completo com o valor padrão port = "Windows" e a impressora selecionada
      const fullConfig = {
        ...config,
        port: "Windows",
        selectedPrinter: selectedPrinter
      };
      
      await invoke("save_printer_settings", { config: fullConfig })
      await invoke("connect_printer", { config: fullConfig, printerName: selectedPrinter })

      setDebugInfo("Configurações salvas com sucesso")
      toast.success("Configurações salvas!", {
        description: "Parâmetros de impressão atualizados.",
      })
    } catch (error) {
      setDebugInfo(`Erro ao salvar: ${error}`)
      toast.error("Erro ao salvar configurações", {
        description: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePrinterChange = (value: string) => {
    setSelectedPrinter(value);
    setDebugInfo(`Impressora selecionada: ${value}`);
    
    // Salvar configuração automaticamente quando uma impressora é selecionada
    // Usar setTimeout para garantir que o estado foi atualizado antes de chamar saveConfig
    setTimeout(() => {
      saveConfigWithSelectedPrinter(value);
    }, 100);
  };

  // Nova função que utiliza um valor específico da impressora em vez de depender do estado
  const saveConfigWithSelectedPrinter = async (printerName: string) => {
    if (!printerName) {
      toast.error("Nenhuma impressora selecionada", {
        description: "Selecione uma impressora primeiro",
      })
      return
    }
    
    setLoading(true)
    setDebugInfo("Salvando configurações automaticamente...")
    try {
      // Criar objeto completo com o valor padrão port = "Windows" e a impressora selecionada
      const fullConfig = {
        ...config,
        port: "Windows",
        selectedPrinter: printerName
      };
      
      await invoke("save_printer_settings", { config: fullConfig })
      await invoke("connect_printer", { config: fullConfig, printerName })

      setDebugInfo("Configurações salvas automaticamente")
      toast.success("Impressora configurada!", {
        description: `${printerName} foi configurada como impressora padrão.`,
      })
    } catch (error) {
      setDebugInfo(`Erro ao salvar: ${error}`)
      toast.error("Erro ao configurar impressora", {
        description: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuração da Impressora</h1>
        </div>
        {loading ? (
          <Button variant="outline" disabled className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            Atualizando...
          </Button>
        ) : (
          <Button 
            variant="outline" 
            onClick={() => {
              setLoading(true);
              searchPrinters(true, true).finally(() => setLoading(false));
            }} 
            className="flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar Lista
          </Button>
        )}
      </div>

      {initialLoad ? (
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
            <Select value={selectedPrinter} onValueChange={handlePrinterChange}>
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
                <span className={`text-sm font-medium ${selectedPrinter ? "text-green-500" : "text-destructive"}`}>
                  {selectedPrinter ? "Impressora Conectada" : "Nenhuma Impressora Selecionada"}
                </span>
              </div>
              {selectedPrinter && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-xs text-muted-foreground">Usando: {selectedPrinter}</span>
                </div>
              )}
            </div>
          </CardContent>
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
                Ajuste os parâmetros de impressão para a impressora do Windows. 
                A impressora selecionada é configurada automaticamente.
              </CardDescription>
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

              <Button 
                onClick={saveConfig} 
                disabled={loading || printers.length === 0 || !selectedPrinter} 
                className="w-full"
              >
                {loading ? "Salvando..." : "Atualizar Configurações de Impressão"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                As alterações de densidade, velocidade e dimensões precisam ser confirmadas pelo botão acima.
                A seleção da impressora é salva automaticamente.
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
                onClick={testPrint} 
                disabled={printers.length === 0 || !selectedPrinter} 
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

      <div className="text-xs text-muted-foreground mt-8 text-right">
        Versão: {version || "Carregando..."}
      </div>
    </div>
  )
}

