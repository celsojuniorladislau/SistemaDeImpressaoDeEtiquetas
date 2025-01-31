# Sistema de Etiquetas - Estrela Metais

Sistema desktop desenvolvido para a Estrela Metais para impressão de etiquetas térmicas, com suporte ao protocolo PPLA.

![Tela do Sistema](./docs/screenshots/dashboard.png)

## 💡 Funcionalidades

- 📦 **Gerenciamento de Produtos**
  - Cadastro completo de produtos
  - Código de produto personalizado
  - Nome abreviado para etiquetas
  - Busca rápida por código ou nome

- 🏷️ **Impressão de Etiquetas**
  - Suporte a impressoras PPLA
  - Código de barras EAN-13
  - Impressão em lote
  - Preview em tempo real
  - Configuração de densidade e velocidade

- ⚙️ **Configurações Avançadas**
  - Detecção automática de portas
  - Configuração de velocidade e densidade
  - Teste de conexão
  - Monitoramento do status da impressora

- 📊 **Dashboard e Relatórios**
  - Visão geral de produtos
  - Histórico de impressões
  - Estatísticas de uso
  - Status da impressora em tempo real

## 🚀 Instalação

### Requisitos

- Windows 10 ou superior
- Impressora térmica compatível com protocolo PPLA
- Porta serial/USB disponível

### Passos para Instalação

1. Baixe o instalador mais recente da [página de releases](https://github.com/seu-usuario/sistema-etiquetas/releases)
2. Execute o instalador e siga as instruções
3. Conecte a impressora antes de iniciar o sistema
4. Configure a porta e velocidade da impressora nas configurações

## 👩‍💻 Desenvolvimento

Para desenvolver o sistema, você precisará:

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm run tauri dev

# Gerar instalador
npm run tauri build
