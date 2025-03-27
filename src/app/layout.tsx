import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"
import { UpdateChecker } from "@/components/Update-checker"
import { Toaster } from "sonner"
import type React from "react"
import { PrinterProvider } from "@/contexts/printer-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Sistema de Etiquetas",
  description: "Sistema de impressão de etiquetas",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" data-theme="light">
      <body className={inter.className}>
        <PrinterProvider>
          <UpdateChecker />
          <Sidebar />
          <div className="pl-64">
            <main className="p-6">{children}</main>
          </div>
          <Toaster />
        </PrinterProvider>
      </body>
    </html>
  )
}

