"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Eye, ZoomIn, ZoomOut, Sun, Moon } from "lucide-react"

interface Product {
  id?: number
  name: string
  name_short: string
  barcode: string
  product_code: string
  quantity?: number
}

interface LabelPreviewDialogProps {
  products: (Product | null)[]
  disabled?: boolean
}

// Função para calcular dígito verificador EAN-13
function calculateEAN13CheckDigit(code: string): number {
  const digits = code.slice(0, 12).split("").map(Number)
  const sum = digits.reduce((acc, digit, index) => {
    const multiplier = index % 2 === 0 ? 1 : 3
    return acc + digit * multiplier
  }, 0)
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit
}

// Função para gerar o padrão de barras EAN-13
function getEAN13Encoding(code: string): string {
  const leftHandPatterns = [
    ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"],
    ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"],
  ]
  const rightHandPattern = [
    "1110010",
    "1100110",
    "1101100",
    "1000010",
    "1011100",
    "1001110",
    "1010000",
    "1000100",
    "1001000",
    "1110100",
  ]

  const paddedCode = code.slice(0, 12).padStart(12, "0")
  const checkDigit = calculateEAN13CheckDigit(paddedCode)
  const fullCode = paddedCode + checkDigit

  const firstDigit = Number.parseInt(fullCode[0])
  let pattern = "101"

  for (let i = 1; i <= 6; i++) {
    const digit = Number.parseInt(fullCode[i])
    const patternSet = firstDigit & (1 << (5 - (i - 1))) ? 1 : 0
    pattern += leftHandPatterns[patternSet][digit]
  }

  pattern += "01010"

  for (let i = 7; i <= 12; i++) {
    const digit = Number.parseInt(fullCode[i])
    pattern += rightHandPattern[digit]
  }

  pattern += "101"

  return pattern
}

export function LabelPreviewDialog({ products, disabled = false }: LabelPreviewDialogProps) {
  const [open, setOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(2)
  const [darkPreview, setDarkPreview] = useState(false)

  // Cálculo correto de produtos únicos e total de etiquetas
  const validProducts = products.filter((p): p is Product => p !== null)
  const uniqueProducts = new Set(validProducts.map((p) => p.id)).size
  const totalEtiquetas = validProducts.length // Já vem preparado com a quantidade correta do componente pai

  // Função simplificada para organizar os produtos em linhas
  const organizeProductRows = () => {
    const rows: Product[][] = []
    for (let i = 0; i < validProducts.length; i += 3) {
      rows.push(validProducts.slice(i, i + 3))
    }
    return rows
  }

  // Função para alternar o zoom
  const toggleZoom = () => {
    setPreviewScale((prev) => (prev === 2 ? 1 : 2))
  }

  // Função para converter mm em pixels com escala dinâmica
  const mmToPx = (mm: number) => mm * 3.7795275591 * previewScale

  // Função para gerar o código de barras
  const generateBarcode = (barcode: string) => {
    const pattern = getEAN13Encoding(barcode)
    const height = mmToPx(22 * 0.35)
    const width = mmToPx(33 * 0.9)
    const moduleWidth = width / 95

    const bars = pattern.split("").map((bit, i) => {
      const x = i * moduleWidth
      return bit === "1" ? <rect key={i} x={x} y={0} width={moduleWidth} height={height * 0.8} fill="black" /> : null
    })

    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-full">
        <rect x={0} y={0} width={width} height={height} fill="white" />
        <g>{bars}</g>
        <text
          x={width / 2}
          y={height * 1}
          textAnchor="middle"
          fill="black"
          fontSize={mmToPx(1.8)}
          className="font-mono"
        >
          {barcode}
        </text>
      </svg>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Eye className="h-4 w-4 mr-2" />
          Visualizar Etiquetas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="flex flex-col gap-4 pb-2">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Preview das Etiquetas</DialogTitle>
            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleZoom}
                title={previewScale === 2 ? "Visualizar em tamanho real" : "Aumentar zoom"}
              >
                {previewScale === 2 ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDarkPreview(!darkPreview)}
                title="Alternar Fundo Escuro"
              >
                {darkPreview ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogDescription className="flex items-center justify-between">
            <span>Visualização das etiquetas que serão impressas</span>
            <span className="text-sm font-normal text-muted-foreground">
              {previewScale === 2 ? "Zoom 2x" : "Tamanho Real"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn("rounded-lg transition-colors", darkPreview ? "bg-slate-800" : "bg-muted/50")}
          style={{
            maxHeight: "calc(90vh - 200px)",
            overflowY: "auto",
          }}
        >
          <div
            className="p-6"
            style={{
              padding: `${1 * previewScale}rem`,
            }}
          >
            <div className="flex flex-col gap-4">
              {organizeProductRows().map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-3 mx-auto"
                  style={{
                    gap: `${0.5 * previewScale}rem`,
                    maxWidth: `${33 * 3.7795275591 * previewScale * 3 + 0.5 * previewScale * 16 * 2}px`,
                  }}
                >
                  {row.map((product, index) => (
                    <div
                      key={`${rowIndex}-${index}`}
                      className={cn(
                        "bg-white shadow-lg rounded-lg flex flex-col items-center justify-between transition-all duration-200",
                        "relative overflow-hidden",
                      )}
                      style={{
                        width: mmToPx(33),
                        height: mmToPx(22),
                        padding: mmToPx(0.5),
                      }}
                    >
                      <div className="flex-1 flex flex-col justify-start items-center gap-[0.15rem] w-full">
                        <div
                          className="w-full text-center font-bold tracking-wide"
                          style={{ fontSize: `${0.6 * previewScale}rem` }}
                        >
                          ESTRELA METAIS
                        </div>
                        <div
                          className="w-full text-center font-medium"
                          style={{ fontSize: `${0.6 * previewScale}rem` }}
                        >
                          {product.name_short}
                        </div>
                        <div
                          className="w-full text-center font-medium"
                          style={{ fontSize: `${0.6 * previewScale}rem` }}
                        >
                          {product.product_code}
                        </div>
                      </div>
                      <div className="mt-auto w-full flex justify-center">{generateBarcode(product.barcode)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>
            Produtos diferentes: {uniqueProducts}
            {" | "}
            Total de etiquetas: {totalEtiquetas}
          </p>
          <p>Dimensões de cada etiqueta: 33mm x 22mm</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

