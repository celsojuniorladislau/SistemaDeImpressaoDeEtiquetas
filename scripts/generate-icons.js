import sharp from "sharp"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { get } from "node:https"

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      const data = []
      response.on("data", (chunk) => {
        data.push(chunk)
      })
      response.on("end", () => {
        resolve(Buffer.concat(data))
      })
    }).on("error", reject)
  })
}

async function generateIcons() {
  try {
    // Cria pasta de saída
    const outputDir = join(process.cwd(), "src-tauri", "icons")
    await mkdir(outputDir, { recursive: true })

    // Baixa a imagem
    console.log("Baixando imagem...")
    const imageBuffer = await downloadImage(
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1738345587497-0xUTAy7zPHnAZVTsua1Bdj1GSpB7L3.png",
    )

    // Lista de tamanhos necessários
    const sizes = [
      { size: 32, name: "32x32.png" },
      { size: 128, name: "128x128.png" },
      { size: 256, name: "128x128@2x.png" },
    ]

    // Gera PNGs em diferentes tamanhos
    for (const { size, name } of sizes) {
      const outputPath = join(outputDir, name)
      await sharp(imageBuffer)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath)
      console.log(`✓ Ícone ${name} gerado em: ${outputPath}`)
    }

    console.log("\n✅ Todos os ícones foram gerados com sucesso em:", outputDir)
    console.log("\nPróximos passos:")
    console.log("1. Converta o arquivo 128x128.png para:")
    console.log("   - icon.ico (Windows) usando https://convertico.com/")
    console.log("   - icon.icns (macOS) usando https://iconverticons.com/online/")
    console.log("2. Coloque os arquivos convertidos (.ico e .icns) na mesma pasta dos ícones")
  } catch (error) {
    console.error("❌ Erro ao gerar ícones:", error)
  }
}

generateIcons()

