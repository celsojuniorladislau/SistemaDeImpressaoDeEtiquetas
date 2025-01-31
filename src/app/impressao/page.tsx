'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Printer, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from "@/components/ui/checkbox"

interface Product {
  id?: number
  name: string
  name_short: string
  code: string
  description?: string
  created_at?: string
  updated_at?: string
}

interface PrintJob {
  id: number
  product_id: number
  product_name: string
  product_code: string
  created_at: string
  status: string
}

interface SelectedProduct extends Product {
  quantity: number
}

export default function ImpressaoPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [printHistory, setPrintHistory] = useState<PrintJob[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<{ [key: number]: SelectedProduct }>({})

  const loadProducts = async () => {
    try {
      const result = await invoke<Product[]>('get_products')
      setProducts(result)
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
    }
  }

  const loadPrintHistory = async () => {
    try {
      const history = await invoke<PrintJob[]>('get_print_history')
      setPrintHistory(history)
    } catch (error) {
      console.error('Erro ao carregar histórico:', error)
    }
  }

  useEffect(() => {
    loadProducts()
    loadPrintHistory()
  }, [])

  const handlePrintSelected = async () => {
    try {
      for (const productId in selectedProducts) {
        const product = selectedProducts[productId]
        // Imprime a quantidade especificada de cada produto selecionado
        for (let i = 0; i < product.quantity; i++) {
          await invoke('print_label', { product })
        }
      }
      loadPrintHistory() // Recarrega o histórico após imprimir
      setSelectedProducts({}) // Limpa a seleção
    } catch (error) {
      console.error('Erro ao imprimir:', error)
    }
  }

  const toggleProductSelection = (product: Product) => {
    setSelectedProducts(prev => {
      const newSelection = { ...prev }
      if (newSelection[product.id!]) {
        delete newSelection[product.id!]
      } else {
        newSelection[product.id!] = { ...product, quantity: 1 }
      }
      return newSelection
    })
  }

  const updateQuantity = (productId: number, quantity: number) => {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], quantity: Math.max(1, quantity) }
    }))
  }

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const hasSelectedProducts = Object.keys(selectedProducts).length > 0

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Impressão das Etiquetas</h1>
          <Button
          onClick={handlePrintSelected}
          className={`transition-opacity duration-300 ${!hasSelectedProducts ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!hasSelectedProducts}  // Manter o botão desabilitado, mas visível
        >
          <Printer className="h-4 w-4 mr-2" />
          Imprimir Selecionados
        </Button>
        
        {/* opção de botão visivel apenas quando um produto é selecionado */}
        {/* {hasSelectedProducts && (
          <Button onClick={handlePrintSelected}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Selecionados
          </Button>
        )} */}
      </div>

      <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou nome..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Nome Abreviado</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead className="text-right">Selecionar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={!!selectedProducts[product.id!]}
                      onCheckedChange={() => toggleProductSelection(product)}
                    />
                  </TableCell>
                  <TableCell>{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.name_short}</TableCell>
                  <TableCell>
                    {selectedProducts[product.id!] && (
                      <Input
                        type="number"
                        min="1"
                        value={selectedProducts[product.id!].quantity}
                        onChange={(e) => updateQuantity(product.id!, parseInt(e.target.value) || 1)}
                        className="w-20"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        toggleProductSelection(product)
                        if (!selectedProducts[product.id!]) {
                          updateQuantity(product.id!, 1)
                        }
                      }}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* {<Card>
        <CardHeader>
          <CardTitle>Histórico de Impressão</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {printHistory.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    {new Date(job.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{job.product_code}</TableCell>
                  <TableCell>{job.product_name}</TableCell>
                  <TableCell className="text-right">{job.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>} */}
    </div>
            
  )
}

