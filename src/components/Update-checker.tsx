"use client"

import { useEffect } from "react"
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater"
import { relaunch } from "@tauri-apps/api/process"
import { toast } from "@/components/ui/use-toast"

export function UpdateChecker() {
  useEffect(() => {
    async function checkForUpdates() {
      try {
        const { shouldUpdate, manifest } = await checkUpdate()

        if (shouldUpdate) {
          // Notifica o usuário sobre a atualização
          const userChoice = window.confirm(
            `Uma nova versão (${manifest?.version}) está disponível. Deseja atualizar agora?`,
          )

          if (userChoice) {
            // Mostra toast de progresso
            toast({
              title: "Atualizando",
              description: "Baixando nova versão...",
              duration: 5000,
            })

            // Instala a atualização
            await installUpdate()

            // Notifica que vai reiniciar
            toast({
              title: "Atualização concluída",
              description: "O sistema será reiniciado para aplicar as atualizações.",
              duration: 3000,
            })

            // Aguarda 3 segundos e reinicia
            setTimeout(async () => {
              await relaunch()
            }, 3000)
          }
        }
      } catch (error) {
        console.error("Erro ao verificar atualizações:", error)
      }
    }

    // Verifica atualizações ao iniciar e a cada 6 horas
    checkForUpdates()
    const interval = setInterval(checkForUpdates, 6 * 60 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return null
}

