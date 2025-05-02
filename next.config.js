/** @type {import('next').NextConfig} */
const repoName = 'SistemaDeImpressaoDeEtiquetas';

const nextConfig = {
  output: 'export',
  distDir: 'out',
  basePath: `/${repoName}`,
  assetPrefix: `/${repoName}/`,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
