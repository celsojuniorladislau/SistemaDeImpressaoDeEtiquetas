"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Printer, ArrowRight } from "lucide-react"
import { motion } from "framer-motion"

export default function HomePage() {
  const router = useRouter()
  const [isHovered, setIsHovered] = useState(false)

  // Função para navegar para a página de impressão
  const navigateToImpressao = () => {
    router.push("/impressao")
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-lg px-4">
        {/* Cabeçalho */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Sistema de Etiquetas</h1>
          <p className="text-muted-foreground text-lg">Bem-vindo ao sistema de impressão de etiquetas</p>
        </div>

        {/* Botão principal */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="mx-auto max-w-md"
        >
          <Card
            className={`cursor-pointer transition-colors border-2 ${isHovered ? "border-primary" : "border-border"}`}
            onClick={navigateToImpressao}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <CardContent className="flex flex-col items-center justify-center p-8">
              <div className={`rounded-full p-4 mb-4 transition-colors ${isHovered ? "bg-primary/10" : "bg-muted"}`}>
                <Printer className={`h-10 w-10 ${isHovered ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Imprimir Etiquetas</h2>
              <p className="text-muted-foreground text-center mb-4">
                Selecione produtos e imprima etiquetas com códigos de barras
              </p>
              <Button variant={isHovered ? "default" : "outline"} className="mt-2">
                Ir para Impressão<ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        
      </div>
    </div>
  )
}
