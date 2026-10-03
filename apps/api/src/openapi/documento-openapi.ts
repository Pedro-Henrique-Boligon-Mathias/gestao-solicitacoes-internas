import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configurarApp } from '../configurar-app';
import { criarEspecificacaoOpenApi } from './especificacao';

/** Ordena as chaves dos objetos recursivamente, para o arquivo não mudar entre gerações. */
function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((chave) => [chave, ordenarChaves((valor as Record<string, unknown>)[chave])]),
    );
  }
  return valor;
}

/**
 * Monta a aplicação sem conectar no banco e devolve o OpenAPI como JSON determinístico
 * (chaves ordenadas, 2 espaços e quebra de linha no fim). É o conteúdo de apps/api/openapi.json.
 */
export async function gerarDocumentoOpenApi(): Promise<string> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    const documento = criarEspecificacaoOpenApi(app);
    return `${JSON.stringify(ordenarChaves(documento), null, 2)}\n`;
  } finally {
    await app.close();
  }
}
