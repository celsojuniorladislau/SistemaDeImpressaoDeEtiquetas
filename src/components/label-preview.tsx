'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { invoke } from "@tauri-apps/api/tauri"
import { PPLAContentType, PPLARequest, PrinterConfig, PPLATextField, PPLABarcodeField } from "@/types/ppla"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import type { Product } from "@/types/product"

interface LabelPreviewProps {
  product: Product
  onPrintSuccess?: () => void
}

export function LabelPreview({ product, onPrintSuccess }: LabelPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  const handlePrint = async () => {
    try {
      setIsPrinting(true)

      const ppla_request: PPLARequest = {
        config: {
          width: 400,    // 50mm * 8 dots
          height: 240,   // 30mm * 8 dots
          density: 8,
          gap: 24,
          speed: 2
        },
        fields: [
          {
            x: 50,
            y: 50,
            content: product.name_short,
            field_type: PPLAContentType.Text,
            font_size: 3,
            horizontal_multiplier: 1,
            vertical_multiplier: 1,
            reverse: false
          } as PPLATextField,
          {
            x: 50,
            y: 100,
            content: product.code,
            field_type: PPLAContentType.Text,
            font_size: 2,
            horizontal_multiplier: 1,
            vertical_multiplier: 1,
            reverse: false
          } as PPLATextField,
          {
            x: 50,
            y: 150,
            content: product.code,
            field_type: PPLAContentType.Barcode,
            barcode_type: "128",
            height: 50,
            readable: true
          } as PPLABarcodeField
        ],
        copies: 1
      }

      const printerConfig: PrinterConfig = {
        port: "COM1", // TODO: Tornar configurável
        baud_rate: 9600,
        darkness: 8,
        width: 400,
        height: 240
      }

      await invoke('print_label', {
        product,
        config: printerConfig,
        ppla_request
      })

      toast({
        title: "Sucesso",
        description: "Etiqueta impressa com sucesso!"
      })
      
      onPrintSuccess?.()
    } catch (error) {
      console.error('Erro ao imprimir etiqueta:', error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao imprimir etiqueta. Verifique a conexão com a impressora."
      })
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia da Etiqueta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <p><strong>Produto:</strong> {product.name}</p>
          <p><strong>Nome Abreviado:</strong> {product.name_short}</p>
          <p><strong>Código:</strong> {product.code}</p>
          {product.description && (
            <p><strong>Descrição:</strong> {product.description}</p>
          )}
        </div>
        <Button 
          onClick={handlePrint} 
          disabled={isPrinting}
          className="w-full"
        >
          {isPrinting ? 'Imprimindo...' : 'Imprimir Etiqueta'}
        </Button>
      </CardContent>
    </Card>
  )
}

