"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Package2, Printer, History } from 'lucide-react'
import { invoke } from "@tauri-apps/api/tauri"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater"
import { relaunch } from "@tauri-apps/api/process"
import { useToast } from "@/components/ui/use-toast"

interface Stats {
  totalProducts: number
  totalLabels: number
  recentPrints: Array<{
    id: number
    product_name: string
    created_at: string
  }>
  recentProducts: Array<{
    id: number
    name: string
    code: string
    created_at: string
  }>
}

function formatarDescricaoAtualizacao(body: string | undefined): string {
  if (!body) return "Melhorias e correções de bugs."
  return body.replace(/[#*_]/g, '').trim()
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalLabels: 0,
    recentPrints: [],
    recentProducts: [],
  })
  const [loading, setLoading] = useState(true)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const { toast, dismiss } = useToast()

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const [products, printHistory] = await Promise.all([
        invoke<any[]>("get_products"),
        invoke<any[]>("get_print_history"),
      ])

      setStats({
        totalProducts: products.length,
        totalLabels: printHistory.length,
        recentPrints: printHistory.slice(0, 5),
        recentProducts: products
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5),
      })
    } catch (error) {
      console.error("Erro ao carregar estatísticas:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as informações do dashboard."
      })
    } finally {
      setLoading(false)
    }
  }

  async function verificarAtualizacao() {
    if (isCheckingUpdate) return
    
    setIsCheckingUpdate(true)
    try {
      console.log('Iniciando verificação de atualização...')
      const update = await checkUpdate()
      console.log('Resultado da verificação:', update)

      if (update.shouldUpdate) {
        console.log('Nova versão disponível:', update.manifest?.version)
        
        const descricao = formatarDescricaoAtualizacao(update.manifest?.body)
        
        toast({
          title: "Nova versão disponível!",
          description: (
            <div className="mt-2 space-y-2">
              <p>Versão {update.manifest?.version}</p>
              <p className="text-sm text-muted-foreground">{descricao}</p>
              <p className="text-sm">Deseja atualizar agora?</p>
            </div>
          ),
          action: (
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => dismiss()}
              >
                Mais tarde
              </Button>
              <Button 
                variant="default"
                size="sm"
                onClick={async () => {
                  try {
                    dismiss() // Fecha o toast anterior
                    
                    // Mostra o toast de download
                    toast({
                      title: "Baixando atualização...",
                      description: "Por favor, aguarde.",
                      duration: 0, // Mantém o toast até ser explicitamente removido
                    })

                    // Instala a atualização
                    console.log('Iniciando instalação...')
                    await installUpdate()
                    console.log('Instalação concluída')

                    // Mostra o toast de conclusão
                    toast({
                      title: "Atualização concluída!",
                      description: "O sistema será reiniciado em 3 segundos...",
                      duration: 3000, // 3 segundos
                    })

                    // Aguarda 3 segundos e reinicia
                    console.log('Aguardando para reiniciar...')
                    await new Promise(resolve => setTimeout(resolve, 3000))
                    console.log('Reiniciando aplicação...')
                    await relaunch()
                  } catch (error) {
                    console.error('Erro ao instalar atualização:', error)
                    toast({
                      variant: "destructive",
                      title: "Erro na atualização",
                      description: String(error),
                      duration: 5000,
                    })
                  }
                }}
              >
                Atualizar agora
              </Button>
            </div>
          ),
          duration: 0, // Toast permanece até o usuário interagir
        })
      } else {
        console.log('Sistema já está na versão mais recente')
      }
    } catch (error) {
      console.error("Erro ao verificar atualização:", error)
      toast({
        variant: "destructive",
        title: "Erro ao verificar atualização",
        description: String(error),
        duration: 5000,
      })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  // Verifica atualizações após o componente montar e periodicamente
  useEffect(() => {
    // Verificação inicial após 1 segundo
    const initialCheck = setTimeout(() => {
      console.log('Realizando verificação inicial de atualizações')
      verificarAtualizacao()
    }, 1000)

    // Verifica a cada 1 hora
    const interval = setInterval(() => {
      console.log('Realizando verificação periódica de atualizações')
      verificarAtualizacao()
    }, 60 * 60 * 1000)

    // Limpa os timers quando o componente é desmontado
    return () => {
      clearTimeout(initialCheck)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Produtos</CardTitle>
            <Package2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.totalProducts}</div>
                <p className="text-xs text-muted-foreground">Produtos cadastrados no sistema</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Etiquetas Impressas</CardTitle>
            <Printer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.totalLabels}</div>
                <p className="text-xs text-muted-foreground">Total de etiquetas impressas</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1 gap-3">
              <Link href="/produtos" className="block">
                <Button className="w-full text-left h-auto py-3" variant="outline">
                  <div className="flex items-center">
                    <Package2 className="h-5 w-5 mr-3" />
                    <div>
                      <div className="font-medium">Gerenciar Produtos</div>
                      <div className="text-sm text-muted-foreground">Cadastre e edite produtos</div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link href="/impressao" className="block">
                <Button className="w-full text-left h-auto py-3" variant="outline">
                  <div className="flex items-center">
                    <Printer className="h-5 w-5 mr-3" />
                    <div>
                      <div className="font-medium">Nova Impressão</div>
                      <div className="text-sm text-muted-foreground">Imprima novas etiquetas</div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link href="/historico" className="block">
                <Button className="w-full text-left h-auto py-3" variant="outline">
                  <div className="flex items-center">
                    <History className="h-5 w-5 mr-3" />
                    <div>
                      <div className="font-medium">Histórico</div>
                      <div className="text-sm text-muted-foreground">Veja o histórico de impressões</div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link href="/fila" className="block">
                <Button className="w-full text-left h-auto py-3" variant="outline">
                  <div className="flex items-center">
                    <Printer className="h-5 w-5 mr-3" />
                    <div>
                      <div className="font-medium">Fila de Impressão</div>
                      <div className="text-sm text-muted-foreground">Gerencie impressões pendentes</div>
                    </div>
                  </div>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>Últimas Impressões</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : stats.recentPrints.length > 0 ? (
              <div className="space-y-4">
                {stats.recentPrints.map((print) => (
                  <div key={print.id} className="flex justify-between items-center text-sm">
                    <span className="font-medium">{print.product_name}</span>
                    <span className="text-muted-foreground">
                      {formatarData(print.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma impressão recente
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>Produtos Recém Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : stats.recentProducts.length > 0 ? (
              <div className="space-y-4">
                {stats.recentProducts.map((product) => (
                  <div key={product.id} className="flex justify-between items-center text-sm">
                    <span className="font-medium">{product.name}</span>
                    <span className="text-muted-foreground">{product.code}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhum produto recente
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}