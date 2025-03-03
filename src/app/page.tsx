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
import { toast } from "@/components/ui/use-toast"

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

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalLabels: 0,
    recentPrints: [],
    recentProducts: [],
  })
  const [loading, setLoading] = useState(true)

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
    } finally {
      setLoading(false)
    }
  }

  async function verificarAtualizacao() {
    try {
      const update = await checkUpdate()
  
      if (update.shouldUpdate) {
        toast({
          title: "Nova atualização disponível!",
          description: `Versão ${update.manifest?.version} - ${update.manifest?.body}`,
          action: (
            <Button 
              variant="default" 
              onClick={async () => {
                try {
                  await installUpdate()
                  
                  toast({
                    title: "Atualização instalada",
                    description: "O aplicativo será reiniciado para aplicar as atualizações.",
                  })

                  setTimeout(async () => {
                    await relaunch()
                  }, 2000)
                } catch (error) {
                  console.error('Erro ao instalar atualização:', error)
                  toast({
                    variant: "destructive",
                    title: "Erro na atualização",
                    description: "Não foi possível instalar a atualização. Tente novamente mais tarde.",
                  })
                }
              }}
            >
              Instalar Agora
            </Button>
          ),
          duration: 0, // Toast permanece até o usuário interagir
        })
      }
    } catch (error) {
      console.error("Erro ao verificar atualização:", error)
    }
  }

  useEffect(() => {
    verificarAtualizacao() // Verifica ao iniciar
    
    // Verifica a cada 1 hora
    const interval = setInterval(verificarAtualizacao, 60 * 60 * 1000)
    
    return () => clearInterval(interval)
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
                    <span className="text-muted-foreground">{new Date(print.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">Nenhuma impressão recente</div>
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
              <div className="text-sm text-muted-foreground text-center py-8">Nenhum produto recente</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}