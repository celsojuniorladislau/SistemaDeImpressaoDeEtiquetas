"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Printer, Trash2 } from "lucide-react"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "@/components/ui/use-toast"

interface PrintJob {
  id: number
  product_name: string
  product_code: string
  created_at: string
  status: string
}

export default function FilaPage() {
  const [printQueue, setPrintQueue] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(true)

  const loadPrintQueue = async () => {
    try {
      const queue = await invoke<PrintJob[]>("get_print_queue")
      setPrintQueue(queue)
    } catch (error) {
      console.error("Erro ao carregar fila de impressão:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar a fila de impressão.",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrintQueue()
  }, []) //Fixed: Added empty dependency array to useEffect

  const handlePrint = async (jobId: number) => {
    try {
      await invoke("print_job", { jobId })
      toast({
        title: "Sucesso",
        description: "Etiqueta impressa com sucesso!",
      })
      loadPrintQueue() // Recarrega a fila
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível imprimir a etiqueta.",
      })
    }
  }

  const handleDelete = async (jobId: number) => {
    try {
      await invoke("delete_print_job", { jobId })
      toast({
        title: "Sucesso",
        description: "Item removido da fila com sucesso!",
      })
      loadPrintQueue() // Recarrega a fila
    } catch (error) {
      console.error("Erro ao remover da fila:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível remover o item da fila.",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fila de Impressão</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {printQueue.length > 0 ? (
                printQueue.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                    <TableCell>{job.product_name}</TableCell>
                    <TableCell>{job.product_code}</TableCell>
                    <TableCell>{job.status}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handlePrint(job.id)}
                          disabled={job.status === "printing"}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDelete(job.id)}
                          disabled={job.status === "printing"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">
                    Nenhum item na fila de impressão
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

