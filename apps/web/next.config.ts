import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Gera um servidor enxuto para a imagem Docker
  output: 'standalone',
  // No monorepo, o rastreamento de arquivos precisa partir da raiz
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
};

export default nextConfig;
