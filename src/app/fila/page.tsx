"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Printer, Pause, Play, XCircle, ArrowUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { invoke } from "@tauri-apps/api/tauri"
import { dialog } from "@tauri-apps/api"
import { Badge } from "@/components/ui/badge"

interface Product {
  id: number
  code: string
  name: string
  price: number
}

interface PrintQueueItem {
  id: number
  product_id: number
  quantity: number
  status: string
  created_at: string
  printed_at: string | null
  product?: Product
}

export default function FilaPage() {
  const [queue, setQueue] = useState<PrintQueueItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadQueue()
    loadProducts()
  }, [])

  async function loadQueue() {
    try {
      const result = await invoke<PrintQueueItem[]>("get_print_queue")
      setQueue(result)
    } catch (error) {
      console.error("Erro ao carregar fila:", error)
      await dialog.message("Erro ao carregar fila de impressão", { type: "error" })
    }
  }

  async function loadProducts() {
    try {
      const result = await invoke<Product[]>("get_products_handler")
      setProducts(result)
    } catch (error) {
      console.error("Erro ao carregar produtos:", error)
    }
  }

  const getProductDetails = (productId: number) => {
    return products.find(p => p.id === productId)
  }

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    setIsLoading(true)
    try {
      await invoke("update_print_queue_status", { id, status: newStatus })
      await loadQueue()
      await dialog.message(`Status atualizado com sucesso!`, { type: "info" })
    } catch (error) {
      console.error("Erro ao atualizar status:", error)
      await dialog.message("Erro ao atualizar status", { type: "error" })
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "Pendente", variant: "secondary", icon: Clock },
      printing: { label: "Imprimindo", variant: "default", icon: Printer },
      paused: { label: "Pausado", variant: "warning", icon: Pause },
      completed: { label: "Concluído", variant: "success", icon: CheckCircle2 },
      cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
      error: { label: "Erro", variant: "destructive", icon: AlertCircle },
    }[status] || { label: status, variant: "secondary", icon: Clock }

    const Icon = statusConfig.icon

    return (
      <Badge variant={statusConfig.variant as any} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {statusConfig.label}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fila de Impressão</h2>
          <p className="text-muted-foreground">
            Gerencie as impressões pendentes e em andamento
          </p>
        </div>
        <Button onClick={() => loadQueue()} disabled={isLoading}>
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila Atual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[150px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const product = getProductDetails(item.product_id)
                  if (!product) return null

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {product.code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        {getStatusBadge(item.status)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm">
                            Criado em: {formatDate(item.created_at)}
                          </p>
                          {item.printed_at && (
                            <p className="text-sm text-muted-foreground">
                              Impresso em: {formatDate(item.printed_at)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdateStatus(item.id, 'printing')}
                                disabled={isLoading}
                                title="Iniciar Impressão"
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdateStatus(item.id, 'cancelled')}
                                disabled={isLoading}
                                title="Cancelar"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {item.status === 'printing' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdateStatus(item.id, 'paused')}
                                disabled={isLoading}
                                title="Pausar"
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdateStatus(item.id, 'completed')}
                                disabled={isLoading}
                                title="Marcar como Concluído"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {item.status === 'paused' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUpdateStatus(item.id, 'printing')}
                              disabled={isLoading}
                              title="Retomar"
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {queue.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Nenhum item na fila de impressão.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}