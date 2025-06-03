"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Printer, Search, AlertCircle, Loader2, Plus, } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { LabelPreviewDialog } from "@/components/LabelPreviewDialog"
import { CheckSquare } from "lucide-react"
import { usePrinter } from "@/contexts/printer-context"

// Interfaces
interface Product {
  id?: number
  name: string
  name_short: string
  barcode: string
  product_code: string
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
  quantity: number | string;
}

// Funções utilitárias para normalização de códigos
function normalizeProductCode(input: string): string {
  // Remove espaços e caracteres não numéricos
  const numericOnly = input.replace(/\D/g, '');
  
  // Se estiver vazio, retorna string vazia
  if (!numericOnly) return '';
  
  // Converte para número e depois para string com 3 dígitos com zeros à esquerda
  const number = parseInt(numericOnly, 10);
  return number.toString().padStart(3, '0');
}

function matchesProductCode(productCode: string, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  
  // Normaliza o termo de busca (ex: "26" vira "026")
  const normalizedSearch = normalizeProductCode(searchTerm);
  
  // Verifica correspondência exata
  if (productCode === normalizedSearch) return true;
  
  // Verifica se o código do produto contém o termo normalizado
  return productCode.includes(normalizedSearch);
}

// Função utilitária para cálculos
function calculateProductStats(selectedProducts: { [key: number]: SelectedProduct }) {
  const uniqueProductsCount = Object.keys(selectedProducts).length;
  const totalEtiquetas = Object.values(selectedProducts).reduce((total, product) => {
    const quantity = product.quantity === '' ? 0 : Number(product.quantity);
    return total + quantity;
  }, 0);

  return {
    uniqueProductsCount,
    totalEtiquetas,
  };
}

export default function ImpressaoPage() {
  // Contexto da impressora
  const { selectedPrinter, config } = usePrinter()
  const [activeProductId, setActiveProductId] = useState<number | null>(null)
  const [quantityEditMode, setQuantityEditMode] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const quantityInputRefs = useRef<{[key: number]: HTMLInputElement}>({})

  // Estados
  const [products, setProducts] = useState<Product[]>([])
  const [printHistory, setPrintHistory] = useState<PrintJob[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProducts, setSelectedProducts] = useState<{ [key: number]: SelectedProduct }>({})
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedRows, setSelectedRows] = useState<number[]>([])
  const [productMap, setProductMap] = useState<Map<number, Product>>(new Map())
  const [printing, setPrinting] = useState(false)

  // Calcula estatísticas
  const { uniqueProductsCount, totalEtiquetas } = calculateProductStats(selectedProducts)
  const hasSelectedProducts = Object.keys(selectedProducts).length > 0
  const isPrinterConfigured = !!selectedPrinter

  // Função para preparar os dados do preview
  const previewData = () => {
    const printQueue: (Product | null)[] = []
  
    // Adiciona produtos selecionados à fila
    for (const productId in selectedProducts) {
      const product = selectedProducts[productId]
      // Para cada produto, adicionar exatamente a quantidade solicitada
      const quantity = product.quantity === '' ? 1 : Number(product.quantity);
      for (let i = 0; i < quantity; i++) {
        printQueue.push(product)
      }
    }
  
    return printQueue
  }

  // Funções de carregamento
  const loadProducts = useCallback(async () => {
    try {
      const result = await invoke<Product[]>("get_products")
      setProducts(result)
      setProductMap(new Map(result.map((product) => [product.id!, product])))
    } catch (error) {
      console.error("Erro ao carregar produtos:", error)
      toast.error("Não foi possível carregar os produtos.", {
        description: String(error),
      })
    }
  }, [])

  const loadPrintHistory = useCallback(async () => {
    try {
      const history = await invoke<PrintJob[]>("get_print_history")
      setPrintHistory(history)
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
    }
  }, [])

  // Efeito de inicialização
  useEffect(() => {
    const initializePage = async () => {
      try {
        await Promise.all([loadProducts(), loadPrintHistory()])
      } catch (error) {
        console.error("Erro ao inicializar página:", error)
      } finally {
        setInitialLoading(false)
      }
    }

    initializePage()
  }, [loadProducts, loadPrintHistory])

  // Funções de manipulação
  const handlePrintSelected = async () => {
    if (!selectedPrinter) {
      toast.error("Erro", {
        description: "Configure a impressora antes de imprimir.",
      })
      return
    }

    setLoading(true)
    try {
      let totalPrinted = 0
      const totalToPrint = Object.values(selectedProducts).reduce((acc, product) => {
        const quantity = product.quantity === '' ? 0 : Number(product.quantity);
        return acc + quantity;
      }, 0);

      // Cria a fila de impressão com exatamente a quantidade especificada
      const printQueue: (Product | null)[] = []
      for (const productId in selectedProducts) {
        const product = selectedProducts[productId]
        const quantity = product.quantity === '' ? 1 : Number(product.quantity);

        for (let i = 0; i < quantity; i++) {
          printQueue.push(product)
        }
      }

      // Imprime em grupos de 3 (isso é limitação física da impressora)
      for (let i = 0; i < printQueue.length; i += 3) {
        const batch = printQueue.slice(i, i + 3)
        // Se o batch tiver menos que 3 etiquetas, completa com null
        while (batch.length < 3) {
          batch.push(null)
        }

        await invoke("print_label_batch", {
          products: batch,
          printerName: selectedPrinter,
        })

        totalPrinted += batch.filter((p) => p !== null).length

        // Atualiza o progresso
        toast.info("Imprimindo...", {
          description: `Etiqueta ${totalPrinted} de ${totalToPrint}`,
        })

        // Espera 1 segundo entre impressões
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      toast.success("Sucesso", {
        description: `${totalPrinted} etiqueta(s) impressa(s) com sucesso!`,
      })

      await loadPrintHistory()
      setSelectedProducts({})
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast.error("Erro de Impressão", {
        description: "Verifique se a impressora está conectada e configurada corretamente.",
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleProductSelection = (product: Product) => {
    setSelectedProducts((prev) => {
      const newSelection = { ...prev }
      if (newSelection[product.id!]) {
        delete newSelection[product.id!]
      } else {
        newSelection[product.id!] = { ...product, quantity: 1 }
      }
      return newSelection
    })
  }

  const updateQuantity = (productId: number, value: number | string) => {
    // Permite valores vazios temporariamente durante a edição
    const newValue = value === '' ? '' : Number(value);
    
    setSelectedProducts((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], quantity: newValue },
    }));
  };

  // Função atualizada para lidar com busca normalizada
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Normaliza o termo de busca
      const normalizedSearch = normalizeProductCode(searchTerm);
      
      // Procura correspondência exata primeiro
      const exactMatch = products.find(
        product => product.product_code === normalizedSearch
      );
      
      if (exactMatch) {
        const productId = exactMatch.id!;
        
        if (!selectedProducts[productId]) {
          toggleProductSelection(exactMatch);
          updateQuantity(productId, 1);
        }
        
        setActiveProductId(productId);
        setSearchTerm('');
        setQuantityEditMode(true);
        
        setTimeout(() => {
          if (quantityInputRefs.current[productId]) {
            quantityInputRefs.current[productId].focus();
            quantityInputRefs.current[productId].select();
          }
        }, 50);
      } else {
        // Se não encontrar correspondência exata, procura por correspondência parcial
        const partialMatch = products.find(
          product => matchesProductCode(product.product_code, searchTerm)
        );
        
        if (partialMatch) {
          const productId = partialMatch.id!;
          
          if (!selectedProducts[productId]) {
            toggleProductSelection(partialMatch);
            updateQuantity(productId, 1);
          }
          
          setActiveProductId(productId);
          setSearchTerm('');
          setQuantityEditMode(true);
          
          setTimeout(() => {
            if (quantityInputRefs.current[productId]) {
              quantityInputRefs.current[productId].focus();
              quantityInputRefs.current[productId].select();
            }
          }, 50);
        } else {
          // Mostra o código normalizado na mensagem de erro
          toast.error("Produto não encontrado", {
            description: `Nenhum produto com o código "${normalizedSearch}" foi encontrado.`,
          });
        }
      }
    }
  };
  
  // Função para lidar com o Enter no campo de quantidade
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, productId: number) => {
    if (e.key === 'Enter') {
      // Garante que o valor final seja pelo menos 1
      const currentValue = selectedProducts[productId].quantity;
      if (currentValue === '' || Number(currentValue) < 1) {
        updateQuantity(productId, 1);
      }
      
      // Desativa o modo de edição de quantidade
      setQuantityEditMode(false);
      setActiveProductId(null);
      
      // Retorna o foco para o campo de busca
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  };

  // Filtragem de produtos atualizada com busca normalizada
  const filteredProducts = products.filter((product) => {
    if (quantityEditMode && activeProductId !== null) {
      return product.id === activeProductId;
    }
    
    // Usar a nova função de correspondência normalizada
    return matchesProductCode(product.product_code, searchTerm);
  });

  // Depois ordena os produtos filtrados, colocando os selecionados no topo
  const sortedFilteredProducts = [...filteredProducts].sort((a, b) => {
    const isASelected = !!selectedProducts[a.id!];
    const isBSelected = !!selectedProducts[b.id!];
    
    if (isASelected && !isBSelected) return -1; // A está selecionado, B não -> A vem primeiro
    if (!isASelected && isBSelected) return 1;  // B está selecionado, A não -> B vem primeiro
    return 0; // Mantém a ordem original se ambos estão selecionados ou ambos não estão
  });

  const lastSelectedIndex = sortedFilteredProducts.findIndex(product => !selectedProducts[product.id!]) - 1;

  const printSelectedProducts = async () => {
    if (!selectedPrinter) {
      toast.error("Erro", {
        description: "Configure a impressora antes de imprimir.",
      })
      return
    }

    setLoading(true)
    try {
      setPrinting(true)

      // Mostra toast de início
      toast.info("Iniciando impressão", {
        description: `Preparando ${selectedRows.length} etiqueta(s) para impressão`,
      })

      console.log(`Preparando impressão de ${selectedRows.length} etiquetas`)
      const batch = selectedRows.map((id) => productMap.get(id))

      console.log(`Usando impressora: ${selectedPrinter || "Padrão"}`)
      toast.info("Enviando para impressora", {
        description: `Usando impressora: ${selectedPrinter || "Padrão"}`,
      })

      // Envia o lote com o nome da impressora selecionada
      await invoke("print_label_batch", {
        products: batch,
        printerName: selectedPrinter,
      })

      console.log(`${selectedRows.length} etiquetas enviadas com sucesso`)
      toast.success("Sucesso", {
        description: `${selectedRows.length} etiqueta(s) impressa(s) com sucesso`,
      })

      // Registra impressão no histórico
      for (const product of batch) {
        if (product) {
          await invoke("add_print_job", {
            productId: product.id,
            productName: product.name,
            productCode: product.product_code,
          })
        }
      }

      // Recarrega o histórico após a impressão
      await loadPrintHistory()
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast.error("Erro ao imprimir etiquetas", {
        description: String(error),
      })
    } finally {
      setPrinting(false)
      setLoading(false)
    }
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
    <div className="container mx-auto p-4">
      <div className="flex flex-col gap-6 max-w-full">
        

        {!isPrinterConfigured && (
          <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2">
              Impressora não configurada.
              <Button
                variant="link"
                className="px-2 py-0 h-auto"
                onClick={() => (window.location.href = "/configuracao")}
              >
                Configurar agora
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Impressão das Etiquetas</h1>
            {hasSelectedProducts && (
              <Badge variant="secondary">
                {uniqueProductsCount} produto{uniqueProductsCount > 1 ? "s" : ""} selecionado
                {uniqueProductsCount > 1 ? "s" : ""}, {totalEtiquetas} etiqueta
                {totalEtiquetas > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Outros botões existentes */}
            {hasSelectedProducts && <LabelPreviewDialog products={previewData()} disabled={false} />}
            <Button
              onClick={handlePrintSelected}
              className="transition-opacity duration-300"
              disabled={!hasSelectedProducts || loading || !isPrinterConfigured}
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

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar por código do produto..."
            className="pl-8 focus:ring-2 focus:ring-amber-400  focus-visible:ring-amber-400 focus-visible:ring-2"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown} // Adicione o evento de tecla aqui
            autoFocus
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Produtos</CardTitle>
              {hasSelectedProducts && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProducts({})}
                  className="h-7 px-2 flex items-center gap-2 border border-input hover:border-accent rounded-md transition-colors"
                >
                  <CheckSquare className="h-4 w-4" />
                  Desmarcar Todos
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Código do Produto</TableHead>
                  <TableHead>Codigo de Barras</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Quantidade de Etiquetas</TableHead>
                  <TableHead className="text-right">Selecionar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFilteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {searchTerm ? `Nenhum produto encontrado para "${normalizeProductCode(searchTerm)}"` : 'Nenhum produto encontrado'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedFilteredProducts.map((product, index) => (
                    <React.Fragment key={product.id}>
                      <TableRow 
                        className={`
                          ${selectedProducts[product.id!] ? "bg-primary/10 hover:bg-primary/15" : ""}
                          table-row-enter table-row-enter-active table-row-move
                        `}
                        
                      >
                        <TableCell>
                          <Checkbox
                            checked={!!selectedProducts[product.id!]}
                            onCheckedChange={() => toggleProductSelection(product)}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono">{product.product_code}</span>
                        </TableCell>
                        <TableCell>{product.barcode}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>
                          {selectedProducts[product.id!] && (
                            <Input
                            type="number"
                            min="0"
                            value={selectedProducts[product.id!].quantity}
                            onChange={(e) => updateQuantity(product.id!, e.target.value)}
                            className={`w-20 ${activeProductId === product.id ? 'ring-2 ring-primary' : ''} focus:ring-2 focus:ring-amber-400  focus-visible:ring-amber-400`}
                            ref={(el) => {
                              if (el) quantityInputRefs.current[product.id!] = el;
                            }}
                            onKeyDown={(e) => handleQuantityKeyDown(e, product.id!)}
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
                            <Plus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      
                      {/* Adiciona a linha divisória após o último produto selecionado */}
                      {index === lastSelectedIndex && lastSelectedIndex >= 0 && (
                        <TableRow>
                          <TableCell 
                            colSpan={6} 
                            className="p-0 h-[4px] bg-primary/50"
                          />
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        
      </div>
    </div>
  )
}