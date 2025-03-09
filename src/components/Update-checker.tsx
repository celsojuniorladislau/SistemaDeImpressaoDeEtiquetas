"use client"

import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "sonner"

interface UpdateInfo {
  version: string
  body?: string
  date: string
}

// Variáveis globais para controle
let lastNotifiedVersion: string | null = null
let lastNotificationTime: number | null = null
let currentToastId: string | number | null = null

// Tempo mínimo entre notificações para a mesma versão (2 horas em milissegundos)
const NOTIFICATION_COOLDOWN = 2 * 60 * 60 * 1000

export function UpdateChecker() {
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    // Função para verificar atualizações usando o backend
    async function checkForUpdates() {
      try {
        console.log("Verificando atualizações via backend...")
        // Usa o comando do backend em vez da API direta do Tauri
        await invoke("check_update_from_backend")
      } catch (error) {
        console.error("Erro ao verificar atualizações:", error)
      }
    }

    // Função para mostrar notificação de atualização
    function showUpdateNotification(updateInfo: UpdateInfo) {
      const currentTime = Date.now()

      // Verifica se já existe um toast ativo
      if (currentToastId) {
        console.log("Já existe um toast ativo, ignorando.")
        return
      }

      // Verifica se é a mesma versão e se o período de cooldown ainda não passou
      if (
        lastNotifiedVersion === updateInfo.version &&
        lastNotificationTime &&
        currentTime - lastNotificationTime < NOTIFICATION_COOLDOWN
      ) {
        console.log(`Notificação para versão ${updateInfo.version} em cooldown, ignorando.`)
        return
      }

      // Atualiza a versão e o timestamp da última notificação
      lastNotifiedVersion = updateInfo.version
      lastNotificationTime = currentTime

      // Mostrar diálogo de confirmação usando toast
      currentToastId = toast("Nova atualização disponível", {
        description: `Versão ${updateInfo.version} disponível para instalação.`,
        action: {
          label: "Instalar",
          onClick: () => {
            handleInstallUpdate()
            // Limpa o ID do toast atual quando o usuário clica em instalar
            currentToastId = null
          },
        },
        duration: 10000, // 10 segundos
        onDismiss: () => {
          // Limpa o ID do toast atual quando o toast é fechado
          currentToastId = null
          console.log("Toast fechado. Próxima notificação possível em 2 horas.")
        },
      })
    }

    // Escutar eventos de atualização do backend
    const setupListeners = async () => {
      // Evento quando uma atualização é encontrada (verificação manual)
      const unlistenManual = await listen<UpdateInfo>("update-manual-check", (event) => {
        console.log("Nova atualização disponível (verificação manual):", event.payload)
        showUpdateNotification(event.payload)
      })

      // Evento quando uma atualização é encontrada (inicialização)
      const unlistenStartup = await listen<UpdateInfo>("update-startup-notification", (event) => {
        console.log("Nova atualização disponível (inicialização):", event.payload)
        showUpdateNotification(event.payload)
      })

      // Eventos de progresso da atualização
      const unlistenPending = await listen("update-pending", () => {
        setIsUpdating(true)
        toast.loading("Baixando atualização...")
      })

      const unlistenInstalled = await listen("update-installed", () => {
        setIsUpdating(false)
        toast.success("Atualização instalada com sucesso! O aplicativo será reiniciado.")

        // Importante: Após instalar uma atualização, resetamos as variáveis de controle
        lastNotifiedVersion = null
        lastNotificationTime = null
      })

      const unlistenError = await listen<{ error: string }>("update-error", (event) => {
        setIsUpdating(false)
        toast.error(`Erro na atualização: ${event.payload.error}`)
      })

      return () => {
        unlistenManual()
        unlistenStartup()
        unlistenPending()
        unlistenInstalled()
        unlistenError()
      }
    }

    // Configurar listeners e verificar atualizações
    let cleanup: (() => void) | undefined

    setupListeners().then((cleanupFn) => {
      cleanup = cleanupFn

      // Verificar atualizações ao iniciar
      checkForUpdates()
    })

    // Verificar atualizações periodicamente (a cada 6 horas)
    const interval = setInterval(
      () => {
        // Só verifica se não estiver atualizando e se não tiver um toast ativo
        if (!isUpdating && !currentToastId) {
          checkForUpdates()
        }
      },
      6 * 60 * 60 * 1000,
    )

    return () => {
      clearInterval(interval)
      if (cleanup) cleanup()
    }
  }, [isUpdating])

  // Função para instalar a atualização
  const handleInstallUpdate = async () => {
    if (isUpdating) return

    try {
      setIsUpdating(true)

      // Mostrar toast de carregamento antes de chamar o backend
      const toastId = toast.loading("Iniciando atualização...")

      // Usa o comando do backend em vez da API direta do Tauri
      await invoke("install_update_from_backend").catch((error) => {
        // Se o backend retornar erro, mostrar mensagem e atualizar o toast
        console.error("Erro ao instalar atualização:", error)
        toast.error(`${error}`, { id: toastId })
        setIsUpdating(false)
        throw error // Propagar o erro para interromper a execução
      })

      // Se chegou aqui, o backend aceitou a solicitação
      // Os eventos de progresso serão tratados pelos listeners
    } catch (error) {
      // Este bloco só será executado se o erro for propagado do catch acima
      console.error("Falha na atualização:", error)
      // Não precisamos fazer nada aqui, pois o toast de erro já foi mostrado
    }
  }

  return null // Este componente não renderiza nada visualmente
}

