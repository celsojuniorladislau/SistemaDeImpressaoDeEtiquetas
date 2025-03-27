"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "sonner"

interface PrinterConfig {
  darkness: number
  width: number
  height: number
  speed: number
  port: string
  selectedPrinter?: string
}

interface PrinterContextType {
  printers: string[]
  selectedPrinter: string
  config: PrinterConfig
  loading: boolean
  searchPrinters: (showToasts?: boolean, silent?: boolean) => Promise<void>
  setSelectedPrinter: (printer: string) => void
  saveConfig: () => Promise<void>
  testPrint: () => Promise<void>
  updateConfig: (newConfig: Partial<PrinterConfig>) => void
  isPrinterConnected: () => Promise<boolean>
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined)

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [printers, setPrinters] = useState<string[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>("")
  const [config, setConfig] = useState<PrinterConfig>({
    darkness: 8,
    width: 840,
    height: 176,
    speed: 2,
    port: "Windows",
  })
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Função para processar impressoras e atualizar estados
  const processPrinters = (found: string[]) => {
    setPrinters(found)

    // Se houver impressoras e nenhuma estiver selecionada, selecione a primeira
    if (!selectedPrinter && found.length > 0) {
      setSelectedPrinter(found[0])
    }

    // Salvar no localStorage para evitar consultas desnecessárias
    try {
      localStorage.setItem("cachedPrinters", JSON.stringify(found))
      localStorage.setItem("printersCacheTime", Date.now().toString())
    } catch (error) {
      console.error("Erro ao salvar cache de impressoras:", error)
    }
  }

  const searchPrinters = async (showToasts = true, silent = false) => {
    // Primeiro tenta mostrar as impressoras em cache enquanto carrega
    try {
      const cachedPrinters = localStorage.getItem("cachedPrinters")
      const cacheTime = localStorage.getItem("printersCacheTime")

      // Se tiver um cache recente (menos de 5 minutos), use-o inicialmente
      const cacheAgeMs = cacheTime ? Date.now() - Number.parseInt(cacheTime) : Number.POSITIVE_INFINITY
      if (cachedPrinters && cacheAgeMs < 5 * 60 * 1000) {
        const cached = JSON.parse(cachedPrinters)
        if (Array.isArray(cached) && cached.length > 0) {
          processPrinters(cached)
          // Se o cache for muito recente (menos de 30 segundos), nem faz nova busca
          if (cacheAgeMs < 30 * 1000 && !showToasts) {
            return
          }
        }
      }
    } catch (error) {
      console.error("Erro ao acessar cache:", error)
    }

    try {
      // Adicionar parâmetro para solicitar operação silenciosa que não cause flash de tela
      const found = await invoke<string[]>("list_printers", { silent: true })
      processPrinters(found)

      if (found.length === 0) {
        if (showToasts) {
          toast.error("Nenhuma impressora encontrada no Windows", {
            description: "Instale uma impressora no Windows para continuar.",
          })
        }
      } else if (showToasts) {
        toast.success("Impressoras encontradas!", {
          description: `${found.length} impressora(s) disponível(is)`,
        })
      }
    } catch (error) {
      console.error("Erro ao procurar impressoras:", error)
      if (showToasts) {
        toast.error("Erro ao procurar impressoras", {
          description: String(error),
        })
      }
    }
  }

  const loadSavedConfig = async () => {
    try {
      const savedConfig = await invoke<PrinterConfig | null>("get_printer_settings")
      if (savedConfig) {
        setConfig(savedConfig)
        // Se houver uma impressora salva nas configurações, selecione-a
        if (savedConfig.selectedPrinter) {
          setSelectedPrinter(savedConfig.selectedPrinter)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)
    }
  }

  const saveConfig = async () => {
    if (!selectedPrinter) {
      toast.error("Nenhuma impressora selecionada", {
        description: "Selecione uma impressora primeiro",
      })
      return
    }

    setLoading(true)
    try {
      // Criar objeto completo com o valor padrão port = "Windows" e a impressora selecionada
      const fullConfig = {
        ...config,
        port: "Windows",
        selectedPrinter: selectedPrinter,
      }

      await invoke("save_printer_settings", { config: fullConfig })
      await invoke("connect_printer", { config: fullConfig, printerName: selectedPrinter })

      toast.success("Configurações salvas!", {
        description: "Parâmetros de impressão atualizados.",
      })
    } catch (error) {
      toast.error("Erro ao salvar configurações", {
        description: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const testPrint = async () => {
    if (!selectedPrinter) {
      toast.error("Nenhuma impressora selecionada", {
        description: "Selecione uma impressora primeiro",
      })
      return
    }

    try {
      await invoke("print_test", { printerName: selectedPrinter })

      toast.success("Teste enviado!", {
        description: "Verifique a impressora",
      })
    } catch (error) {
      toast.error("Erro ao imprimir teste", {
        description: String(error),
      })
    }
  }

  const updateConfig = (newConfig: Partial<PrinterConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }))
  }

  const isPrinterConnected = async () => {
    try {
      return await invoke<boolean>("is_printer_connected")
    } catch (error) {
      console.error("Erro ao verificar conexão da impressora:", error)
      return false
    }
  }

  // Efeito para inicialização
  useEffect(() => {
    if (!initialized) {
      const initialize = async () => {
        setLoading(true)
        try {
          // Carregar configuração e impressoras em paralelo
          await Promise.all([loadSavedConfig(), searchPrinters(false, true)])
        } catch (error) {
          console.error("Erro na inicialização:", error)
        } finally {
          setLoading(false)
          setInitialized(true)
        }
      }

      initialize()
    }
  }, [initialized])

  // Efeito para salvar automaticamente quando a impressora é alterada
  useEffect(() => {
    if (initialized && selectedPrinter) {
      const saveSelectedPrinter = async () => {
        try {
          const fullConfig = {
            ...config,
            port: "Windows",
            selectedPrinter: selectedPrinter,
          }

          await invoke("save_printer_settings", { config: fullConfig })
          await invoke("connect_printer", { config: fullConfig, printerName: selectedPrinter })

          // Não mostrar toast aqui para evitar muitas notificações durante a navegação
        } catch (error) {
          console.error("Erro ao salvar impressora selecionada:", error)
        }
      }

      saveSelectedPrinter()
    }
  }, [selectedPrinter, initialized])

  return (
    <PrinterContext.Provider
      value={{
        printers,
        selectedPrinter,
        config,
        loading,
        searchPrinters,
        setSelectedPrinter,
        saveConfig,
        testPrint,
        updateConfig,
        isPrinterConnected,
      }}
    >
      {children}
    </PrinterContext.Provider>
  )
}

export function usePrinter() {
  const context = useContext(PrinterContext)
  if (context === undefined) {
    throw new Error("usePrinter must be used within a PrinterProvider")
  }
  return context
}

