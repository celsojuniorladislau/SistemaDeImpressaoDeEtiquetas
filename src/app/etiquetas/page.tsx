'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Printer, ZoomIn, ZoomOut, Save, Sun, Moon, AlertCircle, Loader2 } from 'lucide-react'
import { invoke } from "@tauri-apps/api/tauri"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface LabelData {
  name_short: string
  code: string
  width: number
  height: number
  fontSize: {
    company: number
    product: number
    code: number
  }
  printSettings: {
    density: number
    speed: number
  }
}

interface PrinterSettings {
  port: string
  baud_rate: number
  density: number
  width: number
  height: number
  speed: number
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

export default function EtiquetasPage() {
  const [previewScale, setPreviewScale] = useState(2)
  const [loading, setLoading] = useState(false)
  const [darkPreview, setDarkPreview] = useState(false)
  const [codeError, setCodeError] = useState<string>("")
  const [printerConfig, setPrinterConfig] = useState<PrinterSettings | null>(null)
  const [printerError, setPrinterError] = useState<string>("")
  const [initialLoading, setInitialLoading] = useState(true)
  const [labelData, setLabelData] = useState<LabelData>({
    name_short: "Tor.pia.18cm",
    code: "5771",
    width: 33,
    height: 22,
    fontSize: {
      company: 6,
      product: 6,
      code: 6,
    },
    printSettings: {
      density: 8,
      speed: 2,
    },
  })

  useEffect(() => {
    const loadPrinterConfig = async () => {
      try {
        const config = await invoke<PrinterSettings | null>("get_printer_settings")
        setPrinterConfig(config)
        
        if (!config) {
          setPrinterError("Impressora não configurada")
          toast({
            variant: "default",
            title: "Atenção",
            description: "Configure a impressora antes de imprimir etiquetas.",
          })
          return
        }

        setLabelData(prev => ({
          ...prev,
          width: Math.round(config.width / 8),
          height: Math.round(config.height / 8),
          printSettings: {
            density: config.density,
            speed: config.speed,
          },
        }))
      } catch (error) {
        console.error("Erro ao carregar configurações:", error)
        setPrinterError("Erro ao carregar configurações da impressora")
      } finally {
        setInitialLoading(false)
      }
    }

    loadPrinterConfig()
  }, [])

  const handlePrintTest = async () => {
    if (!printerConfig) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Configure a impressora antes de imprimir.",
      })
      return
    }

    try {
      setLoading(true)
      await invoke("print_test_label", {
        labelData: {
          name_short: labelData.name_short,
          code: labelData.code,
          width: labelData.width * 8,
          height: labelData.height * 8,
          print_settings: labelData.printSettings,
        },
      })
      toast({
        title: "Sucesso",
        description: "Etiqueta impressa conforme configuração!",
      })
    } catch (error) {
      console.error("Erro ao imprimir:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível imprimir a etiqueta.",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      const settings = {
        port: printerConfig?.port || "COM1",
        baud_rate: printerConfig?.baud_rate || 9600,
        density: labelData.printSettings.density,
        width: labelData.width * 8,
        height: labelData.height * 8,
        speed: labelData.printSettings.speed,
      }

      await invoke("save_printer_settings", { config: settings })

      toast({
        title: "Sucesso",
        description: "Configurações da etiqueta salvas!",
      })
    } catch (error) {
      console.error("Erro ao salvar configurações:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
      })
    }
  }

  const handleSizeChange = (field: "width" | "height", value: string) => {
    const numValue = Number.parseFloat(value)
    if (!isNaN(numValue) && numValue > 0) {
      setLabelData((prev) => ({ ...prev, [field]: numValue }))
    }
  }

  const handleFontSizeChange = (field: keyof typeof labelData.fontSize, value: number[]) => {
    setLabelData((prev) => ({
      ...prev,
      fontSize: {
        ...prev.fontSize,
        [field]: value[0],
      },
    }))
  }

  const toggleZoom = () => {
    setPreviewScale((prev) => (prev === 2 ? 1 : 2))
  }

  const handlePrintSettingChange = (setting: keyof typeof labelData.printSettings, value: number) => {
    setLabelData((prev) => ({
      ...prev,
      printSettings: {
        ...prev.printSettings,
        [setting]: value,
      },
    }))
  }

  const mmToPx = (mm: number) => mm * 3.7795275591 * previewScale

  const generateBarcode = () => {
    const code = ("789846581" + labelData.code).slice(0, 12)
    const checkDigit = calculateEAN13CheckDigit(code)
    const fullCode = code + checkDigit
    const pattern = getEAN13Encoding(fullCode)

    const height = mmToPx(labelData.height * 0.35)
    const width = mmToPx(labelData.width * 0.9)
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
          {fullCode}
        </text>
      </svg>
    )
  }

  const validateCode = (code: string) => {
    if (!/^\d+$/.test(code)) {
      setCodeError("O código deve conter apenas números")
      return false
    }
    setCodeError("")
    return true
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
    <div className="container mx-auto p-4 space-y-6">
      {printerError && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center gap-2">
            {printerError}
            <Button 
              variant="link" 
              className="px-2 py-0 h-auto"
              onClick={() => window.location.href = '/configuracoes'}
            >
              Configurar Impressora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editor de Etiquetas</h1>
        <div className="flex items-center gap-2">
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
          <Button 
            onClick={handlePrintTest} 
            disabled={loading || !printerConfig}
            className="relative"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {loading ? "Imprimindo..." : "Imprimir Teste"}
            {!printerConfig && (
              <span className="absolute -top-2 -right-2 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configurações da Etiqueta</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" defaultValue={[]}>
              <AccordionItem value="label-size">
                <AccordionTrigger>Dimensões da Etiqueta</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width">Largura (mm)</Label>
                      <Input
                        id="width"
                        type="number"
                        value={labelData.width}
                        onChange={(e) => handleSizeChange("width", e.target.value)}
                        min="1"
                        step="0.1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Altura (mm)</Label>
                      <Input
                        id="height"
                        type="number"
                        value={labelData.height}
                        onChange={(e) => handleSizeChange("height", e.target.value)}
                        min="1"
                        step="0.1"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="label-content">
                <AccordionTrigger>Conteúdo da Etiqueta</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name_short">Nome Abreviado do Produto</Label>
                      <div className="relative">
                        <Input
                          id="name_short"
                          value={labelData.name_short}
                          onChange={(e) => setLabelData((prev) => ({ ...prev, name_short: e.target.value }))}
                          maxLength={20}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-5 text-xs text-muted-foreground">
                          {labelData.name_short.length}/20
                        </span>
                        <p className="text-sm text-muted-foreground mt-1">Quantidade Máxima de 20 caracteres.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="code">Código do Produto</Label>
                      <Input
                        id="code"
                        value={labelData.code}
                        onChange={(e) => {
                          const newCode = e.target.value
                          if (validateCode(newCode)) {
                            setLabelData((prev) => ({ ...prev, code: newCode }))
                          }
                        }}
                        maxLength={10}
                        className={codeError ? "border-red-500" : ""}
                      />
                      {codeError && <p className="text-sm text-red-500">{codeError}</p>}
                    </div>

                    <Button onClick={handleSaveSettings} className="w-full">
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Configurações
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="print-settings">
                <AccordionTrigger>Configurações de Impressão</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Densidade de Impressão</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[labelData.printSettings.density]}
                          onValueChange={(value) => handlePrintSettingChange("density", value[0])}
                          min={1}
                          max={15}
                          step={1}
                          className="flex-1"
                        />
                        <span className="w-12 text-center">{labelData.printSettings.density}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Ajusta o contraste da impressão (1-15)</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Velocidade de Impressão</Label>
                      <Select
                        value={labelData.printSettings.speed.toString()}
                        onValueChange={(value) => handlePrintSettingChange("speed", Number.parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a velocidade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Lenta (Maior Qualidade)</SelectItem>
                          <SelectItem value="2">2 - Normal</SelectItem>
                          <SelectItem value="3">3 - Rápida</SelectItem>
                          <SelectItem value="4">4 - Muito Rápida</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Velocidades mais baixas geralmente resultam em melhor qualidade de impressão
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Visualização</span>
              <span className="text-sm font-normal text-muted-foreground">
                {previewScale === 2 ? "Zoom 2x" : "Tamanho Real"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "flex justify-center p-8 rounded-lg relative",
                darkPreview ? "bg-slate-800" : "bg-muted/50",
              )}
              style={{ maxWidth: "400px", margin: "0 auto" }}
            >
              <div
                className={cn("bg-white shadow-lg flex flex-col relative rounded-lg", "transition-all duration-200")}
                style={{
                  width: mmToPx(labelData.width),
                  height: mmToPx(labelData.height),
                  padding: mmToPx(0.5),
                }}
              >
                <div className="flex-1 flex flex-col justify-start items-center gap-[0.15rem]">
                  <div
                    className="w-full text-center font-bold tracking-wide"
                    style={{ fontSize: `${labelData.fontSize.company * previewScale * 0.1}rem` }}
                  >
                    ESTRELA METAIS
                  </div>

                  <div
                    className="w-full text-center font-medium"
                    style={{ fontSize: `${labelData.fontSize.product * previewScale * 0.1}rem` }}
                  >
                    {labelData.name_short}
                  </div>

                  <div
                    className="w-full text-center font-medium"
                    style={{ fontSize: `${labelData.fontSize.code * previewScale * 0.1}rem` }}
                  >
                    {labelData.code}
                  </div>
                </div>

                <div className="mt-auto w-full flex justify-center">{generateBarcode()}</div>
              </div>
            </div>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>
                Dimensões: {labelData.width}mm x {labelData.height}mm
              </p>
              <p>Código EAN-13: {"789846581" + labelData.code}</p>
              <p className="text-xs text-muted-foreground">
                Dígito verificador: {calculateEAN13CheckDigit(("789846581" + labelData.code).slice(0, 12))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}