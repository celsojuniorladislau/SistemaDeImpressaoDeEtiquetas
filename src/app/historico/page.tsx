"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Printer, Search, Calendar } from 'lucide-react'
import { invoke } from "@tauri-apps/api/tauri"
import { dialog } from "@tauri-apps/api"

interface Product {
  id: number
  code: string
  name: string
  price: number
}

interface PrintHistoryItem {
  id: number
  product_id: number
  quantity: number
  printed_at: string
  template_id: number | null
  user: string
  product?: Product
}

export default function HistoricoPage() {
  const [history, setHistory] = useState<PrintHistoryItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadHistory()
    loadProducts()
  }, [])

  async function loadHistory() {
    try {
      const result = await invoke<PrintHistoryItem[]>("get_print_history")
      setHistory(result)
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
      await dialog.message("Erro ao carregar histórico", { type: "error" })
    }
  }

  async function loadProducts() {
    try {
      const result = await invoke<Product[]>("get_products")
      setProducts(result)
    } catch (error) {
      console.error("Erro ao carregar produtos:", error)
    }
  }

  const getProductDetails = (productId: number) => {
    return products.find(p => p.id === productId)
  }

  const handleReprint = async (item: PrintHistoryItem) => {
    setIsLoading(true)
    try {
      const config = await invoke<any>("get_printer_config")
      
      if (!config) {
        throw new Error("Configuração da impressora não encontrada")
      }

      const product = getProductDetails(item.product_id)
      if (!product) {
        throw new Error("Produto não encontrado")
      }

      const zpl = generateZPL(product)
      await invoke("print_label", {
        config,
        job: {
          id: `reprint-${Date.now()}`,
          content: zpl,
          copies: item.quantity,
          status: "Pending"
        }
      })

      // Registrar nova impressão no histórico
      await invoke("add_print_history", {
        productId: item.product_id,
        quantity: item.quantity,
        templateId: item.template_id,
        user: "Sistema" // Idealmente, usar o usuário atual
      })

      await dialog.message("Etiquetas reenviadas para impressão!", { type: "info" })
      await loadHistory() // Recarregar histórico
    } catch (error) {
      console.error("Erro ao reimprimir:", error)
      await dialog.message("Erro ao reimprimir etiquetas", { type: "error" })
    } finally {
      setIsLoading(false)
    }
  }

  const generateZPL = (product: Product) => {
    return `^XA
^FO50,50^A0N,50,50^FD${product.name}^FS
^FO50,120^A0N,35,35^FDR$ ${product.price.toFixed(2)}^FS
^FO50,170^A0N,30,30^FDCód: ${product.code}^FS
^XZ`
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

  const filteredHistory = history.filter(item => {
    const product = getProductDetails(item.product_id)
    if (!product) return false

    return (
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.code.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Histórico de Impressões</h2>
          <p className="text-muted-foreground">
            Visualize e reimprima etiquetas anteriores
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((item) => {
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
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {formatDate(item.printed_at)}
                        </div>
                      </TableCell>
                      <TableCell>{item.user}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReprint(item)}
                          disabled={isLoading}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Nenhum registro encontrado.
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