# Sistema de Etiquetas - Estrela Metais

Sistema desktop para impressão de etiquetas desenvolvido com Tauri, React e Next.js.

## Versão 1.0.0

### Funcionalidades
- Gerenciamento completo de produtos
- Impressão de etiquetas com código de barras EAN-13
- Configuração de impressora PPLA
- Preview de etiquetas em tempo real
- Histórico de impressões
- Interface moderna e responsiva

### Tecnologias Utilizadas
- Tauri (backend desktop)
- React + Next.js (frontend)
- SQLite (banco de dados local)
- Tailwind CSS (estilização)
- Shadcn/ui (componentes)

### Requisitos
- Windows 10 ou superior
- Impressora térmica compatível com PPLA

### Instalação
1. Baixe o instalador mais recente da seção [Releases](https://github.com/seu-usuario/sistema-etiquetas/releases)
2. Execute o instalador
3. Siga as instruções na tela

### Desenvolvimento
Para desenvolver o projeto localmente:

```bash
# Instala as dependências
npm install

# Inicia o ambiente de desenvolvimento
npm run tauri dev