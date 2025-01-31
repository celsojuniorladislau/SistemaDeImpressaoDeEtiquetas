"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "@/components/ui/use-toast"

interface Product {
  id?: number
  name: string
  name_short: string
  code: string
  description?: string
  created_at?: string
  updated_at?: string
}

interface ProductFormProps {
  onSubmitSuccess?: () => void
  trigger?: React.ReactNode
  productId?: number
}

export function ProductForm({ onSubmitSuccess, trigger, productId }: ProductFormProps) {
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState<Product>({
    name: "",
    name_short: "",
    code: "",
    description: "",
  })
  const isEditing = !!productId

  useEffect(() => {
    if (productId && open) {
      invoke<Product>("get_product", { id: productId })
        .then((product) => {
          setProduct(product)
        })
        .catch((error) => {
          console.error("Erro ao carregar produto:", error)
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível carregar os dados do produto.",
          })
        })
    }
  }, [productId, open])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setProduct((prev) => ({
      ...prev,
      [name]: value,
      // Atualiza name_short automaticamente se o campo alterado for name
      ...(name === "name" ? { name_short: value.substring(0, 20) } : {}),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const productData = {
        name: product.name,
        name_short: product.name_short,
        code: product.code,
        description: product.description,
      }

      if (isEditing) {
        await invoke("update_product", { id: productId, product: productData })
        toast({
          title: "Sucesso",
          description: "Produto atualizado com sucesso.",
        })
      } else {
        await invoke("create_product", { product: productData })
        toast({
          title: "Sucesso",
          description: "Produto criado com sucesso.",
        })
      }

      setOpen(false)
      onSubmitSuccess?.()

      if (!isEditing) {
        setProduct({
          name: "",
          name_short: "",
          code: "",
          description: "",
        })
      }
    } catch (error) {
      console.error("Erro ao salvar produto:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao salvar o produto.",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Produto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar" : "Novo"} Produto</DialogTitle>
          <DialogDescription>Preencha os dados do produto. Clique em salvar quando terminar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                value={product.name}
                onChange={handleChange}
                placeholder="Nome completo do produto"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_short">Nome Abreviado</Label>
              <div className="relative">
                <Input
                  id="name_short"
                  name="name_short"
                  value={product.name_short}
                  onChange={handleChange}
                  maxLength={20}
                  placeholder="Nome para etiqueta"
                  required
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {product.name_short.length}/20
                </span>
              </div>
              <p className="text-[0.8rem] text-muted-foreground">
                Máximo de 20 caracteres. Usado na impressão da etiqueta.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                name="code"
                value={product.code}
                onChange={handleChange}
                placeholder="Código do produto"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                name="description"
                value={product.description || ""}
                onChange={handleChange}
                placeholder="Descrição opcional do produto"
                className="min-h-[100px] resize-y"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">{isEditing ? "Atualizar" : "Criar"} Produto</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

