"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "@/components/ui/use-toast"

interface PrintJob {
  id: number
  product_name: string
  product_code: string
  created_at: string
  status: string
}

export default function HistoricoPage() {
  const [history, setHistory] = useState<PrintJob[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)

  const loadHistory = async () => {
    try {
      const printHistory = await invoke<PrintJob[]>("get_print_history")
      setHistory(printHistory)
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar o histórico de impressão.",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, []) //Fixed: Added empty dependency array to useEffect

  const filteredHistory = history.filter(
    (job) =>
      job.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.product_code.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por produto ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Impressão</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.length > 0 ? (
                filteredHistory.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                    <TableCell>{job.product_name}</TableCell>
                    <TableCell>{job.product_code}</TableCell>
                    <TableCell className="text-right">{job.status}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4">
                    {searchTerm ? "Nenhum resultado encontrado" : "Nenhum histórico de impressão"}
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

