export type PPLAContentType = "TEXT" | "BARCODE" | "QR_CODE"

export interface PPLAField {
  type: PPLAContentType
  x: number
  y: number
  content: string
  fontSize?: number
  rotation?: number
  height?: number
  width?: number
  humanReadable?: boolean
}

export interface PPLARequest {
  width: number
  height: number
  fields: PPLAField[]
  copies?: number
  darkness?: number
  speed?: number
}

export interface Product {
  id?: number
  name: string
  name_short: string
  code: string
  description?: string
  created_at?: string
  updated_at?: string
}

export interface PrintJob {
  id: number
  product_name: string
  product_code: string
  created_at: string
  status: string
}

