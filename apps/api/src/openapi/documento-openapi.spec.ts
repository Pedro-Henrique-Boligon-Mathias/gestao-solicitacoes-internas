import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gerarDocumentoOpenApi } from './documento-openapi';

interface DocumentoOpenApi {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: {
    schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
  };
}

const CAMINHO_CONTRATO = path.resolve(__dirname, '..', '..', 'openapi.json');

describe('ADR-001: contrato OpenAPI', () => {
  let gerado: string;
  let documento: DocumentoOpenApi;

  beforeAll(async () => {
    gerado = await gerarDocumentoOpenApi();
    documento = JSON.parse(gerado) as DocumentoOpenApi;
  });

  it('ADR-001: o documento contém GET /health/live e GET /health/ready', () => {
    expect(documento.paths['/health/live']).toHaveProperty('get');
    expect(documento.paths['/health/ready']).toHaveProperty('get');
  });

  it('ADR-001: /health/ready documenta as respostas 200 e 503 com schema', () => {
    const respostas = documento.paths['/health/ready']!.get!.responses;
    for (const codigo of ['200', '503']) {
      expect(respostas[codigo]).toMatchObject({
        content: { 'application/json': { schema: expect.any(Object) } },
      });
    }
  });

  it('ADR-001: o documento contém o componente ProblemDetails com errors[] opcional', () => {
    const problema = documento.components.schemas.ProblemDetails;
    expect(problema).toBeDefined();
    expect(Object.keys(problema?.properties ?? {})).toEqual(
      expect.arrayContaining([
        'type',
        'title',
        'status',
        'instance',
        'code',
        'requestId',
        'errors',
      ]),
    );
    expect(problema?.required ?? []).not.toContain('errors');
  });

  it('ADR-001: duas gerações seguidas devolvem a mesma string', async () => {
    await expect(gerarDocumentoOpenApi()).resolves.toBe(gerado);
  });

  it('ADR-001: o JSON gerado é determinístico (chaves ordenadas, 2 espaços, \\n no fim)', () => {
    function ordenar(valor: unknown): unknown {
      if (Array.isArray(valor)) return valor.map(ordenar);
      if (valor && typeof valor === 'object') {
        return Object.fromEntries(
          Object.keys(valor)
            .sort()
            .map((chave) => [chave, ordenar((valor as Record<string, unknown>)[chave])]),
        );
      }
      return valor;
    }
    expect(gerado).toBe(`${JSON.stringify(ordenar(documento), null, 2)}\n`);
  });

  it('ADR-001: o apps/api/openapi.json commitado é igual ao gerado', () => {
    expect(readFileSync(CAMINHO_CONTRATO, 'utf8')).toBe(gerado);
  });
});
