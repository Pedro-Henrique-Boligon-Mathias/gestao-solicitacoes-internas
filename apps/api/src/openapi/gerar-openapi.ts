import './ambiente-sem-banco';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { gerarDocumentoOpenApi } from './documento-openapi';

// Uso: pnpm --filter api openapi:generate (grava apps/api/openapi.json)
const destino = path.resolve(__dirname, '..', '..', 'openapi.json');

gerarDocumentoOpenApi()
  .then((documento) => {
    writeFileSync(destino, documento);
    process.stdout.write(`OpenAPI gerado em ${destino}\n`);
  })
  .catch((erro: unknown) => {
    process.stderr.write(`Falha ao gerar o OpenAPI: ${String(erro)}\n`);
    process.exit(1);
  });
