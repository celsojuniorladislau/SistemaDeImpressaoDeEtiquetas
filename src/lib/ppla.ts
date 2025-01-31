import type { PPLARequest, PPLAField } from "@/types"

export function createDefaultPPLARequest(
  product: {
    name: string
    name_short: string
    code: string
  },
  options: {
    copies?: number
    darkness?: number
    speed?: number
  } = {},
): PPLARequest {
  const fields: PPLAField[] = [
    // Nome do produto (abreviado)
    {
      type: "TEXT",
      x: 10,
      y: 10,
      content: product.name_short,
      fontSize: 3,
    },
    // Código de barras
    {
      type: "BARCODE",
      x: 10,
      y: 40,
      content: product.code,
      height: 50,
      width: 2,
      humanReadable: true,
    },
  ]

  return {
    width: 100, // Largura da etiqueta em mm
    height: 100, // Altura da etiqueta em mm
    fields,
    copies: options.copies || 1,
    darkness: options.darkness || 10,
    speed: options.speed || 2,
  }
}

