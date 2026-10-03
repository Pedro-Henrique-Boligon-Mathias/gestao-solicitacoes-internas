import { gerarDocumentoOpenApi } from './documento-openapi';

interface Esquema {
  $ref?: string;
  type?: string;
  nullable?: boolean;
  example?: unknown;
  properties?: Record<string, Esquema>;
  required?: string[];
  items?: Esquema;
  enum?: string[];
  allOf?: Esquema[];
  anyOf?: Esquema[];
  oneOf?: Esquema[];
}

interface Parametro {
  name: string;
  in: string;
  schema?: Esquema;
}

interface Operacao {
  operationId?: string;
  security?: Record<string, string[]>[];
  parameters?: Parametro[];
  responses: Record<string, { content?: Record<string, { schema: Esquema }> }>;
}

interface DocumentoOpenApi {
  paths: Record<string, Record<string, Operacao>>;
  components: { schemas: Record<string, Esquema> };
}

const REPROCESSAMENTO = '/api/v1/solicitacoes/{id}/integracao/reprocessamento';

describe('ADR-001: contrato OpenAPI da integração (Fase 3)', () => {
  let documento: DocumentoOpenApi;

  beforeAll(async () => {
    documento = JSON.parse(await gerarDocumentoOpenApi()) as DocumentoOpenApi;
  });

  /** Resolve `$ref`, `allOf: [x]` e `anyOf/oneOf` com null até chegar ao esquema com propriedades. */
  function resolver(esquema: Esquema | undefined): Esquema | undefined {
    if (!esquema) return undefined;
    if (esquema.$ref) {
      return resolver(
        documento.components.schemas[esquema.$ref.replace('#/components/schemas/', '')],
      );
    }
    for (const lista of [esquema.allOf, esquema.anyOf, esquema.oneOf]) {
      const escolhido = lista?.find((item) => item.type !== 'null');
      if (escolhido) return resolver(escolhido);
    }
    return esquema;
  }

  function temExemplo(esquema: Esquema | undefined): boolean {
    const resolvido = resolver(esquema);
    if (!resolvido) return false;
    if (esquema?.example !== undefined || resolvido.example !== undefined) return true;
    return Object.values(resolvido.properties ?? {}).some(
      (propriedade) => propriedade.example !== undefined,
    );
  }

  describe('POST /solicitacoes/{id}/integracao/reprocessamento', () => {
    it('ADR-001: existe, exige Bearer e documenta 200, 401, 403, 404 e 409', () => {
      const operacao = documento.paths[REPROCESSAMENTO]?.post;
      expect(operacao).toBeDefined();
      expect(operacao?.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operacao?.responses ?? {})).toEqual(
        expect.arrayContaining(['200', '401', '403', '404', '409']),
      );
    });

    it('ADR-001: 200 devolve SolicitacaoDto e os erros usam ProblemDetails', () => {
      const respostas = documento.paths[REPROCESSAMENTO]?.post?.responses ?? {};
      expect(respostas['200']?.content?.['application/json']?.schema).toEqual({
        $ref: '#/components/schemas/SolicitacaoDto',
      });
      for (const codigo of ['403', '404', '409']) {
        expect(JSON.stringify(respostas[codigo])).toContain('#/components/schemas/ProblemDetails');
      }
    });
  });

  describe('SolicitacaoDto', () => {
    it('ADR-001: tem integracao obrigatória e anulável, com os campos do contrato', () => {
      const solicitacao = documento.components.schemas.SolicitacaoDto;
      const propriedade = solicitacao?.properties?.integracao;
      expect(propriedade).toBeDefined();
      expect(solicitacao?.required).toContain('integracao');
      expect(JSON.stringify(propriedade)).toMatch(/"nullable":true|"type":"null"/);

      const integracao = resolver(propriedade);
      expect(Object.keys(integracao?.properties ?? {}).sort()).toEqual(
        [
          'aguardando',
          'enviadaEm',
          'eventos',
          'maxTentativas',
          'proximaTentativaEm',
          'status',
          'tentativas',
          'tipo',
        ].sort(),
      );
      expect(resolver(integracao?.properties?.status)?.enum?.sort()).toEqual(
        ['ENVIADO', 'FALHOU', 'PENDENTE'].sort(),
      );
      expect(resolver(integracao?.properties?.tipo)?.enum?.sort()).toEqual(
        ['SolicitacaoAprovada', 'SolicitacaoReaberta'].sort(),
      );

      const evento = resolver(resolver(integracao?.properties?.eventos)?.items);
      expect(Object.keys(evento?.properties ?? {}).sort()).toEqual(
        ['criadoEm', 'enviadaEm', 'id', 'status', 'tentativas', 'tipo'].sort(),
      );
    });

    it('ADR-001: acoesPermitidas inclui REPROCESSAR_INTEGRACAO', () => {
      const acoes = resolver(
        documento.components.schemas.SolicitacaoDto?.properties?.acoesPermitidas,
      );
      expect(resolver(acoes?.items)?.enum).toContain('REPROCESSAR_INTEGRACAO');
    });

    it('ADR-001: o contrato não expõe payload, ultimo erro nem correlation id da outbox', () => {
      const texto = JSON.stringify(documento.components.schemas.SolicitacaoDto);
      expect(texto).not.toMatch(/payload|ultimoErro|correlation/i);
    });
  });

  it('ADR-012: GET /areas é pública (sem exigência de Bearer)', () => {
    const operacao = documento.paths['/api/v1/areas']?.get;
    expect(operacao).toBeDefined();
    expect(operacao?.security ?? []).toEqual([]);
  });

  it('ADR-001: GET /solicitacoes documenta o filtro area (UUID, pode repetir)', () => {
    const area = documento.paths['/api/v1/solicitacoes']?.get?.parameters?.find(
      (parametro) => parametro.name === 'area',
    );
    expect(area).toMatchObject({ in: 'query' });
    expect(JSON.stringify(area?.schema)).toContain('"format":"uuid"');
    expect(JSON.stringify(area?.schema)).toContain('"type":"array"');
  });

  describe('ADR-001: exemplos (example) nos DTOs', () => {
    it.each([
      'LoginDto',
      'RefreshDto',
      'RespostaSessaoDto',
      'UsuarioAtualDto',
      'AreaDto',
      'CriarSolicitacaoDto',
      'EditarSolicitacaoDto',
      'DecisaoDto',
      'ReaberturaDto',
      'SolicitacaoDto',
      'PaginaSolicitacoesDto',
      'EventoHistoricoDto',
      'ResumoDto',
      'ProblemDetails',
    ])('ADR-001: %s tem example', (nome) => {
      expect(documento.components.schemas[nome]).toBeDefined();
      expect(temExemplo(documento.components.schemas[nome])).toBe(true);
    });

    it('ADR-001: todo DTO do documento tem example', () => {
      const semExemplo = Object.entries(documento.components.schemas)
        .filter(([, esquema]) => !temExemplo(esquema))
        .map(([nome]) => nome);
      expect(semExemplo).toEqual([]);
    });
  });
});
