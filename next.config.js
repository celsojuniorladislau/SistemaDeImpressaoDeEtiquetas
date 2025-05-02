/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
    distDir: 'out',
    basePath: process.env.NODE_ENV === 'production' ? '/SistemaDeImpressaoDeEtiquetas' : '',
    assetPrefix: process.env.NODE_ENV === 'production' ? '/SistemaDeImpressaoDeEtiquetas/' : '',
    images: {
      unoptimized: true,
    }
  }

module.exports = nextConfig