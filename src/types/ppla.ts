export enum PPLAContentType {
    Text = "text",
    Barcode = "barcode"
  }
  
  export interface PPLAField {
    x: number
    y: number
    content: string
    field_type: PPLAContentType
    font_size?: number
    rotation?: number
    horizontal_multiplier?: number
    vertical_multiplier?: number
    reverse?: boolean
  }
  
  export interface PPLAConfig {
    width: number
    height: number
    density: number
    gap: number
    speed?: number
  }
  
  export interface PPLARequest {
    config: PPLAConfig
    fields: PPLAField[]
    copies: number
  }
  
  export interface PrinterConfig {
    port: string
    baud_rate: number
    darkness: number
    width: number
    height: number
    speed?: number
  }
  
  // Adicionando tipos específicos para melhor tipagem
  export interface PPLATextField extends PPLAField {
    field_type: PPLAContentType.Text
    font_size: number
    horizontal_multiplier: number
    vertical_multiplier: number
    reverse?: boolean
  }
  
  export interface PPLABarcodeField extends PPLAField {
    field_type: PPLAContentType.Barcode
    barcode_type?: string
    height?: number
    readable?: boolean
  }
  
  