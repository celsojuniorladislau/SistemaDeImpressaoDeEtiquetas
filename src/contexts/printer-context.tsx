"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "sonner"

// Atualizar a interface PrinterConfig para corresponder exatamente ao que o backend retorna
interface PrinterConfig {
  darkness: number
  width: number
  height: number
  speed: number
  port: string
  selected_printer?: string | null // Alterado para corresponder ao tipo retornado pelo backend
}

interface PrinterContextType {
  printers: string[]
  selectedPrinter: string
  config: PrinterConfig
  loading: boolean
  searchPrinters: (showToasts?: boolean, silent?: boolean) => Promise<void>
  setSelectedPrinter: (printer: string) => Promise<boolean> // Retorna boolean indicando sucesso
  saveConfig: () => Promise<void>
  testPrint: () => Promise<void>
  updateConfig: (newConfig: Partial<PrinterConfig>) => void
  isPrinterConnected: () => Promise<boolean>
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined)

// Função utilitária para salvar no localStorage com tratamento de erros
const saveToLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    console.error(`Erro ao salvar ${key} no localStorage:`, error)
    return false
  }
}

// Função utilitária para ler do localStorage com tratamento de erros
const getFromLocalStorage = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.error(`Erro ao ler ${key} do localStorage:`, error)
    return null
  }
}

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [printers, setPrinters] = useState<string[]>([])
  const [selectedPrinter, setSelectedPrinterState] = useState<string>("")
  const [config, setConfig] = useState<PrinterConfig>({
    darkness: 8,
    width: 840,
    height: 176,
    speed: 2,
    port: "Windows",
  })
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Atualizar a função processPrinters para lidar com o valor null/undefined
  const processPrinters = (found: string[], savedPrinter?: string | null) => {
    setPrinters(found)

    // Se temos uma impressora salva e ela existe na lista, use-a
    if (savedPrinter && found.includes(savedPrinter)) {
      console.log("Usando impressora salva:", savedPrinter)
      setSelectedPrinterState(savedPrinter)
    }
    // Se não temos uma impressora salva ou ela não existe mais, mas temos impressoras disponíveis
    else if (!selectedPrinter && found.length > 0) {
      console.log("Selecionando primeira impressora disponível:", found[0])
      setSelectedPrinterState(found[0])
    }

    // Salvar no localStorage para evitar consultas desnecessárias
    saveToLocalStorage("cachedPrinters", JSON.stringify(found))
    saveToLocalStorage("printersCacheTime", Date.now().toString())
  }

  // Função modificada para ser assíncrona e garantir que a impressora seja salva
  const setSelectedPrinter = async (printer: string) => {
    console.log("Definindo impressora selecionada:", printer)

    // Atualiza o estado local
    setSelectedPrinterState(printer)

    // Salva no localStorage imediatamente
    saveToLocalStorage("selectedPrinter", printer)

    try {
      // Salva no banco de dados SQLite
      const fullConfig = {
        ...config,
        port: "Windows",
        selected_printer: printer, // Usando o nome correto da coluna
      }

      console.log("Salvando configuração com impressora:", fullConfig)
      await invoke("save_printer_settings", { config: fullConfig })

      // Tenta conectar à impressora
      await invoke("connect_printer", { config: fullConfig, printerName: printer })

      console.log("Impressora salva e conectada com sucesso:", printer)
      return true
    } catch (error) {
      console.error("Erro ao salvar impressora nas configurações:", error)
      // Mesmo com erro, mantemos o estado local e localStorage atualizados
      return false
    }
  }

  const searchPrinters = async (showToasts = true, silent = false) => {
    // Primeiro tenta mostrar as impressoras em cache enquanto carrega
    const cachedPrinters = getFromLocalStorage("cachedPrinters")
    const cacheTime = getFromLocalStorage("printersCacheTime")

    // Se tiver um cache recente (menos de 5 minutos), use-o inicialmente
    const cacheAgeMs = cacheTime ? Date.now() - Number.parseInt(cacheTime) : Number.POSITIVE_INFINITY
    if (cachedPrinters && cacheAgeMs < 5 * 60 * 1000) {
      try {
        const cached = JSON.parse(cachedPrinters)
        if (Array.isArray(cached) && cached.length > 0) {
          processPrinters(cached, config.selected_printer || getFromLocalStorage("selectedPrinter"))
          // Se o cache for muito recente (menos de 30 segundos), nem faz nova busca
          if (cacheAgeMs < 30 * 1000 && !showToasts) {
            return
          }
        }
      } catch (error) {
        console.error("Erro ao processar cache de impressoras:", error)
      }
    }

    try {
      // Adicionar parâmetro para solicitar operação silenciosa que não cause flash de tela
      const found = await invoke<string[]>("list_printers", { silent: true })
      processPrinters(found, config.selected_printer || getFromLocalStorage("selectedPrinter"))

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

  // Atualizar a função loadSavedConfig para lidar corretamente com o valor null/undefined
  const loadSavedConfig = async () => {
    try {
      console.log("Carregando configurações salvas...")
      const savedConfig = await invoke<PrinterConfig | null>("get_printer_settings")

      if (savedConfig) {
        console.log("Configurações carregadas:", savedConfig)
        setConfig(savedConfig)

        // Se houver uma impressora salva nas configurações, selecione-a
        if (savedConfig.selected_printer) {
          console.log("Impressora salva encontrada nas configurações:", savedConfig.selected_printer)
          setSelectedPrinterState(savedConfig.selected_printer)
          saveToLocalStorage("selectedPrinter", savedConfig.selected_printer)
        } else {
          console.log("Nenhuma impressora salva nas configurações")

          // Tentar recuperar do localStorage
          const localPrinter = getFromLocalStorage("selectedPrinter")
          if (localPrinter) {
            console.log("Impressora encontrada no localStorage:", localPrinter)
            setSelectedPrinterState(localPrinter)

            // Atualiza as configurações com a impressora do localStorage
            const updatedConfig = { ...savedConfig, selected_printer: localPrinter }
            setConfig(updatedConfig)

            // Salva de volta nas configurações
            await invoke("save_printer_settings", { config: updatedConfig })
            console.log("Configurações atualizadas com impressora do localStorage")
          }
        }
      } else {
        console.log("Nenhuma configuração salva encontrada")

        // Tentar recuperar do localStorage
        const localPrinter = getFromLocalStorage("selectedPrinter")
        if (localPrinter) {
          console.log("Impressora encontrada no localStorage:", localPrinter)
          setSelectedPrinterState(localPrinter)

          // Cria uma nova configuração com a impressora do localStorage
          const newConfig = { ...config, selected_printer: localPrinter }
          setConfig(newConfig)

          // Salva nas configurações
          await invoke("save_printer_settings", { config: newConfig })
          console.log("Novas configurações criadas com impressora do localStorage")
        }
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)

      // Tentar recuperar do localStorage como fallback
      const localPrinter = getFromLocalStorage("selectedPrinter")
      if (localPrinter) {
        console.log("Usando impressora do localStorage após erro:", localPrinter)
        setSelectedPrinterState(localPrinter)
      }
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
        selected_printer: selectedPrinter, // Usando o nome correto da coluna
      }

      console.log("Salvando configurações completas:", fullConfig)
      await invoke("save_printer_settings", { config: fullConfig })
      await invoke("connect_printer", { config: fullConfig, printerName: selectedPrinter })

      // Salvar também no localStorage para redundância
      saveToLocalStorage("selectedPrinter", selectedPrinter)

      toast.success("Configurações salvas!", {
        description: "Parâmetros de impressão atualizados.",
      })
    } catch (error) {
      console.error("Erro ao salvar configurações:", error)
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

  // Efeito para inicialização - Modificado para garantir a ordem correta
  useEffect(() => {
    if (!initialized) {
      const initialize = async () => {
        setLoading(true)
        try {
          // Primeiro carregamos as configurações para obter a impressora salva
          await loadSavedConfig()

          // Depois buscamos as impressoras disponíveis
          await searchPrinters(false, true)
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

  // Removemos o efeito automático para evitar salvamentos desnecessários
  // Agora o salvamento é explicitamente controlado pela função setSelectedPrinter

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
