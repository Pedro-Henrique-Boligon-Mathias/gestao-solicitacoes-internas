import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gerarDocumentoOpenApi } from './documento-openapi';

interface Operacao {
  responses: Record<string, unknown>;
  security?: Record<string, string[]>[];
  requestBody?: { content: Record<string, { schema: EsquemaOuRef }> };
}

interface Esquema {
  properties?: Record<string, EsquemaOuRef>;
  required?: string[];
}

type EsquemaOuRef = Esquema & { $ref?: string };

interface DocumentoOpenApi {
  paths: Record<string, Record<string, Operacao>>;
  components: {
    schemas: Record<string, Esquema>;
    securitySchemes?: Record<string, { type: string; scheme?: string; bearerFormat?: string }>;
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

  describe('autenticação', () => {
    /** Resolve um `$ref` local (#/components/schemas/X) para o esquema. */
    function resolver(esquema: EsquemaOuRef | undefined): Esquema | undefined {
      const ref = esquema?.$ref;
      if (!ref) return esquema;
      return documento.components.schemas[ref.replace('#/components/schemas/', '')];
    }

    function esquemaDaResposta(rota: string, metodo: string, codigo: string): Esquema | undefined {
      const resposta = documento.paths[rota]?.[metodo]?.responses[codigo] as
        { content?: Record<string, { schema: EsquemaOuRef }> } | undefined;
      return resolver(resposta?.content?.['application/json']?.schema);
    }

    function esquemaDoCorpo(rota: string, metodo: string): Esquema | undefined {
      return resolver(
        documento.paths[rota]?.[metodo]?.requestBody?.content['application/json']?.schema,
      );
    }

    it.each([
      ['/api/v1/auth/login', 'post', ['200', '400', '401', '429']],
      ['/api/v1/auth/refresh', 'post', ['200', '400', '401', '429']],
      ['/api/v1/auth/logout', 'post', ['204', '401']],
      ['/api/v1/auth/me', 'get', ['200', '401']],
    ])('ADR-001: %s (%s) documenta as respostas %j', (rota, metodo, codigos) => {
      const operacao = documento.paths[rota]?.[metodo];
      expect(operacao).toBeDefined();
      expect(Object.keys(operacao?.responses ?? {})).toEqual(expect.arrayContaining(codigos));
    });

    it('ADR-001: os erros 4xx das rotas de auth usam o componente ProblemDetails', () => {
      for (const [rota, metodo, codigo] of [
        ['/api/v1/auth/login', 'post', '401'],
        ['/api/v1/auth/login', 'post', '429'],
        ['/api/v1/auth/refresh', 'post', '401'],
        ['/api/v1/auth/me', 'get', '401'],
      ] as const) {
        const resposta = documento.paths[rota]?.[metodo]?.responses[codigo];
        expect(JSON.stringify(resposta)).toContain('#/components/schemas/ProblemDetails');
      }
    });

    it('ADR-001: o documento declara o esquema de segurança Bearer (JWT)', () => {
      expect(documento.components.securitySchemes?.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it('ADR-001: logout e me exigem Bearer; login e refresh são públicos', () => {
      expect(documento.paths['/api/v1/auth/logout']?.post?.security).toEqual([{ bearer: [] }]);
      expect(documento.paths['/api/v1/auth/me']?.get?.security).toEqual([{ bearer: [] }]);
      expect(documento.paths['/api/v1/auth/login']?.post?.security ?? []).toEqual([]);
      expect(documento.paths['/api/v1/auth/refresh']?.post?.security ?? []).toEqual([]);
    });

    it('ADR-001: contém os DTOs RespostaSessaoDto e UsuarioAtualDto', () => {
      const sessao = documento.components.schemas.RespostaSessaoDto;
      const usuario = documento.components.schemas.UsuarioAtualDto;

      expect(Object.keys(sessao?.properties ?? {}).sort()).toEqual(
        ['accessExpiraEm', 'accessToken', 'refreshExpiraEm', 'refreshToken', 'usuario'].sort(),
      );
      expect(Object.keys(usuario?.properties ?? {}).sort()).toEqual(
        ['area', 'cargo', 'email', 'id', 'nome'].sort(),
      );
      expect(Object.keys(resolver(usuario?.properties?.area)?.properties ?? {}).sort()).toEqual([
        'id',
        'nome',
      ]);
    });

    it('ADR-001: login e refresh devolvem RespostaSessaoDto; me devolve UsuarioAtualDto', () => {
      const sessao = documento.components.schemas.RespostaSessaoDto;
      expect(esquemaDaResposta('/api/v1/auth/login', 'post', '200')).toEqual(sessao);
      expect(esquemaDaResposta('/api/v1/auth/refresh', 'post', '200')).toEqual(sessao);
      expect(esquemaDaResposta('/api/v1/auth/me', 'get', '200')).toEqual(
        documento.components.schemas.UsuarioAtualDto,
      );
    });

    it('ADR-001: os corpos de login e refresh estão documentados', () => {
      expect(esquemaDoCorpo('/api/v1/auth/login', 'post')?.required?.sort()).toEqual([
        'email',
        'senha',
      ]);
      expect(esquemaDoCorpo('/api/v1/auth/refresh', 'post')?.required).toEqual(['refreshToken']);
    });
  });

  it('ADR-001: o comentário do evento de histórico é texto ou null, não lista', () => {
    const comentario = documento.components.schemas.EventoHistoricoDto?.properties?.comentario as
      { type?: string; nullable?: boolean; items?: unknown } | undefined;
    expect(comentario).toMatchObject({ type: 'string', nullable: true });
    expect(comentario).not.toHaveProperty('items');
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
