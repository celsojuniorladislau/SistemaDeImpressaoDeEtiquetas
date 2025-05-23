"use client"

import { Button } from "@/components/ui/button"
import { Package, Settings, Home, Printer, LayoutDashboard } from 'lucide-react'
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/ui/theme-toggle"

const menuItems = [
  {
    title: "Início",
    href: "/",
    icon: Home
  },
  {
    title: "Impressão",
    href: "/impressao",
    icon: Printer
  },
  {
    title: "Produtos",
    href: "/produtos",
    icon: Package
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard 
  },
  {
    title: "Configurações",
    href: "/configuracoes",
    icon: Settings
  }
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-background border-r fixed inset-y-0 left-0 flex flex-col">
      <div className="h-14 bg-primary text-primary-foreground flex items-center px-6">
        <span className="font-semibold">Sistema de Impressão de Etiquetas</span>
      </div>
      <div className="p-4 flex flex-col gap-1">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={pathname === item.href ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.title}
            </Button>
          </Link>
        ))}
      </div>
      
      {/* Espaçador que empurra o ThemeToggle para o final */}
      <div className="flex-grow"></div>
      
      {/* Botão de alternar tema */}
      <div className="p-4 border-t">
        <ThemeToggle />
      </div>
    </div>
  )
}