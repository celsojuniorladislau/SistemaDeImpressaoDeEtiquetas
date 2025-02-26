"use client"

import { useEffect, useState, useCallback } from 'react'
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
import { Printer, Search, AlertCircle, Loader2, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
//import { PrintPreview } from "@/components/print-preview"

// Interfaces
interface Product {
  id?: number
  name: string
  barcode: string
  product_code: string
  name_short: string // Adicionado para compatibilidade com PrintPreview
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

interface PrinterConfig {
  port: string
  baud_rate: number
  density: number
  width: number
  height: number
  speed: number
}

export default function ImpressaoPage() {
  // Estados
  const [products, setProducts] = useState<Product[]>([])
  const [printHistory, setPrintHistory] = useState<PrintJob[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<{ [key: number]: SelectedProduct }>({})
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false) // Novo estado para controlar a visibilidade do preview

  // Funções de carregamento
  const loadPrinterConfig = useCallback(async () => {
    try {
      const config = await invoke<PrinterConfig | null>('get_printer_settings')
      setPrinterConfig(config)
      
      if (!config) {
        toast({
          variant: "default",
          title: "Atenção",
          description: "Impressora não configurada. Configure a impressora antes de imprimir.",
        })
      }
    } catch (error) {
      console.error('Erro ao carregar configurações da impressora:', error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao carregar configurações da impressora.",
      })
    }
  }, [])

  const loadProducts = useCallback(async () => {
    try {
      const result = await invoke<Product[]>('get_products')
      setProducts(result)
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar os produtos.",
      })
    }
  }, [])

  const loadPrintHistory = useCallback(async () => {
    try {
      const history = await invoke<PrintJob[]>('get_print_history')
      setPrintHistory(history)
    } catch (error) {
      console.error('Erro ao carregar histórico:', error)
    }
  }, [])

  // Efeito de inicialização
  useEffect(() => {
    const initializePage = async () => {
      try {
        await Promise.all([
          loadProducts(),
          loadPrintHistory(),
          loadPrinterConfig()
        ])
      } catch (error) {
        console.error('Erro ao inicializar página:', error)
      } finally {
        setInitialLoading(false)
      }
    }

    initializePage()
  }, [loadProducts, loadPrintHistory, loadPrinterConfig])

  // Funções de manipulação
  const handlePrintSelected = async () => {
    if (!printerConfig) {
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Configure a impressora antes de imprimir.",
        })
        return
    }

    setLoading(true)
    try {
        let totalPrinted = 0
        const totalToPrint = Object.values(selectedProducts).reduce((acc, product) => acc + product.quantity, 0)

        // Agrupa as etiquetas em conjuntos de 3
        const printQueue: (Product | null)[] = []
        for (const productId in selectedProducts) {
            const product = selectedProducts[productId]
            for (let i = 0; i < product.quantity; i++) {
                printQueue.push(product)
            }
        }

        // Imprime em grupos de 3
        for (let i = 0; i < printQueue.length; i += 3) {
            const batch = printQueue.slice(i, i + 3)
            // Se o batch tiver menos que 3 etiquetas, completa com null
            while (batch.length < 3) {
                batch.push(null)
            }

            await invoke('print_label_batch', { products: batch })
            totalPrinted += batch.filter(p => p !== null).length

            // Atualiza o progresso
            toast({
                title: "Imprimindo...",
                description: `Etiqueta ${totalPrinted} de ${totalToPrint}`,
            })

            // Espera 1 segundo entre impressões
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        toast({
            title: "Sucesso",
            description: `${totalPrinted} etiqueta(s) impressa(s) com sucesso!`,
        })

        await loadPrintHistory()
        setSelectedProducts({})
    } catch (error) {
        console.error('Erro ao imprimir:', error)
        toast({
            variant: "destructive",
            title: "Erro de Impressão",
            description: "Verifique se a impressora está conectada e configurada corretamente.",
        })
    } finally {
        setLoading(false)
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

  // Filtragem de produtos
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const hasSelectedProducts = Object.keys(selectedProducts).length > 0
  const totalEtiquetas = Object.values(selectedProducts).reduce((acc, product) => acc + product.quantity, 0)

  // Preparar dados para o preview
  const previewData = () => {
    const printQueue: (Product | null)[] = []
    for (const productId in selectedProducts) {
      const product = selectedProducts[productId]
      for (let i = 0; i < product.quantity; i++) {
        printQueue.push(product)
      }
    }
    
    // Pegar apenas o primeiro conjunto de 3 etiquetas para o preview
    const firstBatch = printQueue.slice(0, 3)
    // Completar com null se necessário
    while (firstBatch.length < 3) {
      firstBatch.push(null)
    }
    
    return firstBatch
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {!printerConfig && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center gap-2">
            Impressora não configurada. 
            <Button 
              variant="link" 
              className="px-2 py-0 h-auto"
              onClick={() => window.location.href = '/configuracoes'}
            >
              Configurar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Impressão das Etiquetas</h1>
          {hasSelectedProducts && (
            <Badge variant="secondary">
              {totalEtiquetas} etiqueta{totalEtiquetas > 1 ? 's' : ''} selecionada{totalEtiquetas > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            disabled={!hasSelectedProducts}
            className="transition-opacity duration-300"
          >
            <Eye className="h-4 w-4 mr-2" />
            {showPreview ? "Ocultar Preview" : "Ver Preview"}
          </Button>
          <Button
            onClick={handlePrintSelected}
            className="transition-opacity duration-300"
            disabled={!hasSelectedProducts || loading || !printerConfig}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Imprimindo...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Selecionados
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Preview das etiquetas */}
      {showPreview && hasSelectedProducts && (
        <Card>
          <CardHeader>
            <CardTitle>Preview das Etiquetas</CardTitle>
          </CardHeader>
          <CardContent>
            <PrintPreview products={previewData()} />
            {totalEtiquetas > 3 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Mostrando preview das primeiras 3 etiquetas de um total de {totalEtiquetas}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, código do produto ou código de barras..."
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
                <TableHead>Código do Produto</TableHead>
                <TableHead>Codigo de Barras</TableHead>
                <TableHead>Nome </TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead className="text-right">Selecionar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum produto encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                        checked={!!selectedProducts[product.id!]}
                        onCheckedChange={() => toggleProductSelection(product)}
                      />
                    </TableCell>
                    <TableCell>{product.product_code}</TableCell>
                    <TableCell>{product.barcode}</TableCell>
                    <TableCell>{product.name}</TableCell>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
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
              {printHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum histórico de impressão
                  </TableCell>
                </TableRow>
              ) : (
                printHistory.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      {new Date(job.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{job.product_code}</TableCell>
                    <TableCell>{job.product_name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={job.status === 'completed' ? 'default' : 'secondary'}>
                        {job.status === 'completed' ? 'Concluído' : job.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}