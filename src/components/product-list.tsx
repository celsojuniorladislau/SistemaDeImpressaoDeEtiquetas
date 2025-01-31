"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Edit2, Trash2 } from 'lucide-react'
import { invoke } from "@tauri-apps/api/tauri"
import { ProductForm } from "./product-form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dialog } from "@tauri-apps/api"

interface Product {
  id?: number
  code: string
  name: string
  price: number
}

interface ProductListProps {
  onEdit?: (product: Product | null) => void
  editingProduct?: Product | null
  onEditSuccess?: () => void
  refreshTrigger?: number
}

export function ProductList({ onEdit, editingProduct, onEditSuccess, refreshTrigger }: ProductListProps) {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  async function loadProducts() {
    try {
      const result = await invoke<Product[]>("get_products_handler")
      setProducts(result)
    } catch (error) {
      console.error("Erro ao carregar produtos:", error)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [refreshTrigger])

  const handleDelete = async (id: number) => {
    const confirmed = await dialog.confirm('Tem certeza que deseja excluir este produto?', {
      title: 'Confirmar exclusão',
      type: 'warning'
    })

    if (confirmed) {
      try {
        await invoke("delete_product_handler", { id })
        await loadProducts()
      } catch (error) {
        console.error("Erro ao excluir produto:", error)
        await dialog.message('Erro ao excluir produto', { title: 'Erro', type: 'error' })
      }
    }
  }

  const handleEdit = (product: Product) => {
    onEdit?.(product)
    setIsEditDialogOpen(true)
  }

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            placeholder="Buscar produtos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.code}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(product)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => product.id && handleDelete(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editingProduct && (
        <ProductForm
          editingProduct={editingProduct}
          onSuccess={() => {
            if (onEditSuccess) onEditSuccess()
            setIsEditDialogOpen(false)
          }}
          controlledOpen={isEditDialogOpen}
          onControlledOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) onEdit?.(null)
          }}
        />
      )}
    </div>
  )
}

