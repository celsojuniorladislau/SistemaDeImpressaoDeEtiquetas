"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Eye, ZoomIn, ZoomOut, Printer, Loader2 } from "lucide-react"
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "sonner"
import { usePrinter } from "@/contexts/printer-context"

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
  onPrintSuccess?: () => void
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

export function LabelPreviewDialog({ products, disabled = false, onPrintSuccess }: LabelPreviewDialogProps) {
  const [open, setOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [printing, setPrinting] = useState(false)

  // Obter o contexto da impressora
  const { selectedPrinter } = usePrinter()

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
    setPreviewScale((prev) => (prev === 1 ? 2 : 1))
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

  // Função para imprimir as etiquetas
  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error("Erro", {
        description: "Configure a impressora antes de imprimir.",
      })
      return
    }

    setPrinting(true)
    try {
      let totalPrinted = 0
      const totalToPrint = validProducts.length

      // Imprime em grupos de 3 (isso é limitação física da impressora)
      for (let i = 0; i < validProducts.length; i += 3) {
        // Cria um batch com os produtos atuais (até 3)
        const currentBatch = validProducts.slice(i, i + 3)

        // Cria um novo array com tipagem explícita que permite null
        const batch: (Product | null)[] = [...currentBatch]

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

      // Fechar o diálogo após impressão bem-sucedida
      setOpen(false)

      // Chamar o callback de sucesso se fornecido
      if (onPrintSuccess) {
        onPrintSuccess()
      }
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast.error("Erro de Impressão", {
        description: "Verifique se a impressora está conectada e configurada corretamente.",
      })
    } finally {
      setPrinting(false)
    }
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
                title={previewScale === 1 ? "Aumentar zoom" : "Visualizar em tamanho real"}
              >
                {previewScale === 1 ? <ZoomIn className="h-4 w-4" /> : <ZoomOut className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogDescription className="flex items-center justify-between">
            <span>Visualização das etiquetas que serão impressas</span>
            <span className="text-sm font-normal text-muted-foreground">
              {previewScale === 1 ? "Tamanho Real" : "Zoom 2x"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div
          className="rounded-lg transition-colors bg-slate-800"
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
                        "shadow-lg rounded-lg flex flex-col items-center justify-between transition-all duration-200",
                        "relative overflow-hidden",
                        "bg-white text-black",
                      )}
                      style={{
                        width: mmToPx(33),
                        height: mmToPx(22),
                        padding: mmToPx(0.5),
                      }}
                    >
                      <div className="flex-1 flex flex-col justify-start items-center gap-[0.15rem] w-full">
                        <div
                          className="w-full text-center font-bold tracking-wide text-black"
                          style={{ fontSize: `${0.6 * previewScale}rem` }}
                        >
                          ESTRELA METAIS
                        </div>
                        <div
                          className="w-full text-center font-medium text-black"
                          style={{ fontSize: `${0.6 * previewScale}rem` }}
                        >
                          {product.name_short}
                        </div>
                        <div
                          className="w-full text-center font-medium text-black"
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

        <DialogFooter className="mt-6">
          <div className="flex w-full justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {/* {selectedPrinter ? (
                <span>Impressora: {selectedPrinter}</span>
              ) : (
                <span className="text-amber-500">Nenhuma impressora configurada</span>
              )} */}
            </div>
            <Button
              onClick={handlePrint}
              disabled={printing || !selectedPrinter || validProducts.length === 0}
              className="min-w-[150px]"
            >
              {printing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Imprimindo...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Etiquetas
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
