/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Desativa a geração de arquivos estáticos durante o desenvolvimento
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig

