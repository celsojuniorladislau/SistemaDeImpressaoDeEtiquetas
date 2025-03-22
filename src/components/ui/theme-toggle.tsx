"use client"

import { useState, useEffect } from "react"
import { Button } from "./button"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  
  // Função para alternar o tema
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
    
    // Atualiza o atributo data-theme no elemento html
    document.documentElement.setAttribute("data-theme", newTheme)
    
    // Salva a preferência no localStorage
    localStorage.setItem("theme", newTheme)
  }
  
  // Carrega o tema salvo no localStorage ao iniciar
  useEffect(() => {
    // Verifica se o usuário já tem uma preferência salva
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null
    
    // Verifica se o sistema operacional está configurado para modo escuro
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    
    // Define o tema inicial com base na preferência salva ou do sistema
    const initialTheme = savedTheme || (prefersDark ? "dark" : "light")
    setTheme(initialTheme)
    
    // Aplica o tema ao elemento HTML
    document.documentElement.setAttribute("data-theme", initialTheme)
  }, [])
  
  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={toggleTheme}
    >
      {theme === "light" ? (
        <>
          <Moon className="mr-2 h-4 w-4" />
          Modo Escuro
        </>
      ) : (
        <>
          <Sun className="mr-2 h-4 w-4" />
          Modo Claro
        </>
      )}
    </Button>
  )
} 