"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pencil, Trash2, Search, Plus, AlertTriangle } from 'lucide-react'
import { ProductForm } from "@/components/product-form"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Product {
  id: number
  product_code: string
  barcode: string
  name: string
  name_short: string
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

// Função para formatar código para exibição (remove zero à esquerda para códigos 010-099)
function formatProductCodeForDisplay(productCode: string): string {
  const number = parseInt(productCode, 10);
  // Para números de 10 a 99, remove o zero à esquerda
  if (number >= 10 && number <= 99) {
    return number.toString();
  }
  // Para outros números (001-009, 100+), mantém o formato original
  return productCode;
}

function matchesProductCode(productCode: string, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  
  // Normaliza o termo de busca (ex: "26" vira "026")
  const normalizedSearch = normalizeProductCode(searchTerm);
  
  // Verifica correspondência exata com o código normalizado
  if (productCode === normalizedSearch) return true;
  
  // Também verifica correspondência com o formato de exibição
  const displayFormat = formatProductCodeForDisplay(productCode);
  const searchNumber = parseInt(searchTerm.replace(/\D/g, ''), 10);
  const displayNumber = parseInt(displayFormat, 10);
  
  if (searchNumber === displayNumber) return true;
  
  // Verifica se o código do produto contém o termo normalizado
  return productCode.includes(normalizedSearch);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<number | null>(null)
  const [editingProductId, setEditingProductId] = useState<number | null>(null)

  useEffect(() => {
    loadProducts()
  }, [])

  // Effect para simular clique no botão de edição quando editingProductId for definido
  useEffect(() => {
    if (editingProductId !== null) {
      // Usar setTimeout para garantir que o DOM foi renderizado
      const timer = setTimeout(() => {
        const editButton = document.querySelector(`[data-product-id="${editingProductId}"] button[data-edit-button]`);
        if (editButton) {
          (editButton as HTMLButtonElement).click();
          setEditingProductId(null); // Reset após clique
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [editingProductId]);

  const loadProducts = async () => {
    try {
      const data = await invoke<Product[]>("get_products")
      setProducts(data)
    } catch (error) {
      console.error("Erro ao carregar produtos:", error)
      toast.error("Erro ao carregar produtos", {
        description: String(error)
      })
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = (id: number) => {
    setProductToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (productToDelete === null) return

    try {
      await invoke("delete_product", { id: productToDelete })
      toast.success("Produto excluído com sucesso")
      await loadProducts()
    } catch (error) {
      console.error("Erro ao excluir produto:", error)
      toast.error("Erro ao excluir produto", {
        description: String(error)
      })
    } finally {
      setProductToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  const handleEditClose = () => {
    setEditingProductId(null);
  }

  // Aplicando a mesma lógica de filtro do primeiro arquivo com correspondência exata
  const filteredProducts = products.filter((product) => {
    // Se não há busca, mostra todos os produtos
    if (!searchTerm.trim()) return true;
    
    // Normaliza o termo de busca
    const normalizedSearch = normalizeProductCode(searchTerm);
    
    // Para códigos de produto, busca apenas correspondência exata
    const exactCodeMatch = product.product_code === normalizedSearch;
    
    // Para outros campos, mantém a busca parcial
    const matchesName = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesShortName = product.name_short.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBarcode = product.barcode.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Se o termo de busca parece ser um código (só números), prioriza correspondência exata no código
    const isNumericSearch = /^\d+$/.test(searchTerm.trim());
    if (isNumericSearch) {
      return exactCodeMatch;
    }
    
    // Para busca não numérica, inclui todos os campos
    return exactCodeMatch || matchesName || matchesShortName || matchesBarcode;
  });

  // Função para lidar com Enter na busca
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Normaliza o termo de busca
      const normalizedSearch = normalizeProductCode(searchTerm);
      
      // Procura correspondência exata no código
      const exactMatch = products.find(
        product => product.product_code === normalizedSearch
      );
      
      if (exactMatch) {
        // Encontrou correspondência exata - entra em modo de edição
        setEditingProductId(exactMatch.id);
        setSearchTerm(''); // Limpa a busca
      } else {
        // Se não encontrar correspondência exata, mostra mensagem
        const displayCode = searchTerm.replace(/\D/g, '') ? 
          formatProductCodeForDisplay(normalizedSearch) : 
          searchTerm;
        toast.error("Produto não encontrado", {
          description: `Nenhum produto com o código "${displayCode}" foi encontrado.`,
        });
      }
    }
  };

  // Ordena os produtos: primeiro correspondências exatas, depois outras
  const sortedFilteredProducts = [...filteredProducts].sort((a, b) => {
    if (!searchTerm.trim()) return 0; // Se não há busca, mantém ordem original
    
    const normalizedSearch = normalizeProductCode(searchTerm);
    const aExactMatch = a.product_code === normalizedSearch;
    const bExactMatch = b.product_code === normalizedSearch;
    
    // Correspondência exata no código vem primeiro
    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;
    
    // Se ambos são correspondência exata ou nenhum é, verifica correspondência parcial
    if (aExactMatch === bExactMatch) {
      const aPartialMatch = matchesProductCode(a.product_code, searchTerm);
      const bPartialMatch = matchesProductCode(b.product_code, searchTerm);
      
      // Produtos que correspondem ao código vem antes
      if (aPartialMatch && !bPartialMatch) return -1;
      if (!aPartialMatch && bPartialMatch) return 1;
    }
    
    return 0;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Carregando ...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produtos Cadastrados</h1>
        <ProductForm
          onSubmitSuccess={loadProducts}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          }
        />
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Digite o código do produto para buscar e aperte Enter para editar."
            className="pl-8 focus:ring-2 focus:ring-amber-400 focus-visible:ring-amber-400 focus-visible:ring-2"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      </div>

      <div className="border rounded-lg max-h-[480px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código do Produto</TableHead>
              <TableHead>Código de Barras</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Nome Abreviado</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFilteredProducts.length > 0 ? (
              sortedFilteredProducts.map((product) => (
                <TableRow key={product.id} data-product-id={product.id}>
                  <TableCell className="font-medium">
                    <span className="font-mono">{formatProductCodeForDisplay(product.product_code)}</span>
                  </TableCell>
                  <TableCell className="font-mono">{product.barcode}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.name_short}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProductForm
                        productId={product.id}
                        onSubmitSuccess={() => {
                          loadProducts();
                          handleEditClose();
                        }}
                        trigger={
                          <Button variant="ghost" size="sm" data-edit-button>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => confirmDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  {searchTerm ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}