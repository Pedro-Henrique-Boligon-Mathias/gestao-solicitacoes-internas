import { gerarDocumentoOpenApi } from './documento-openapi';

interface Esquema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  nullable?: boolean;
  maxItems?: number;
  properties?: Record<string, Esquema>;
  required?: string[];
  items?: Esquema;
  enum?: string[];
  allOf?: Esquema[];
  anyOf?: Esquema[];
  oneOf?: Esquema[];
}

interface Operacao {
  parameters?: { name: string; in: string; required?: boolean; schema?: Esquema }[];
  responses?: Record<string, { content?: Record<string, { schema: Esquema }> }>;
  security?: unknown;
}

interface DocumentoOpenApi {
  paths: Record<string, Record<string, Operacao>>;
  components: { schemas: Record<string, Esquema> };
}

const INTEGRIDADE = '/api/v1/auditoria/integridade';

/** Auditoria do histórico com hash encadeado: GET /auditoria/integridade (só Admin). */
describe('RN-10: contrato OpenAPI da auditoria do histórico', () => {
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

  const operacao = () => documento.paths[INTEGRIDADE]?.get;
  const resposta = () =>
    resolver(operacao()?.responses?.['200']?.content?.['application/json']?.schema);
  const campo = (esquema: Esquema | undefined, nome: string) =>
    resolver(esquema?.properties?.[nome]);
  const chaves = (esquema: Esquema | undefined) => Object.keys(esquema?.properties ?? {}).sort();

  it('RN-10: GET /auditoria/integridade existe, exige Bearer e documenta 200, 401 e 403', () => {
    expect(operacao()).toBeDefined();
    expect(operacao()?.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operacao()?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '403']),
    );
    for (const codigo of ['401', '403']) {
      expect(JSON.stringify(operacao()?.responses?.[codigo])).toContain(
        '#/components/schemas/ProblemDetails',
      );
    }
  });

  it('RN-10: não recebe parâmetros', () => {
    expect(operacao()).toBeDefined();
    expect(operacao()?.parameters ?? []).toEqual([]);
  });

  it('RN-10: resposta tem integro, contagens, divergencias e verificadoEm, todos obrigatórios', () => {
    const corpo = resposta();
    const campos = [
      'divergencias',
      'eventosVerificados',
      'integro',
      'solicitacoesVerificadas',
      'totalDivergencias',
      'verificadoEm',
    ];
    expect(chaves(corpo)).toEqual(campos);
    expect(corpo?.required?.sort()).toEqual(campos);
    expect(campo(corpo, 'integro')?.type).toBe('boolean');
    for (const nome of ['eventosVerificados', 'solicitacoesVerificadas', 'totalDivergencias']) {
      expect(campo(corpo, nome)?.type).toBe('integer');
    }
    expect(campo(corpo, 'verificadoEm')?.format).toBe('date-time');
    expect(campo(corpo, 'divergencias')?.type).toBe('array');
    expect(campo(corpo, 'divergencias')?.maxItems).toBe(20);
  });

  it('RN-10: divergência com solicitacao {id, codigo, excluida}, eventoId, tipo, criadoEm e motivo', () => {
    const divergencia = resolver(campo(resposta(), 'divergencias')?.items);
    const campos = ['criadoEm', 'eventoId', 'motivo', 'solicitacao', 'tipo'];
    expect(chaves(divergencia)).toEqual(campos);
    expect(divergencia?.required?.sort()).toEqual(campos);
    const solicitacao = resolver(campo(divergencia, 'solicitacao'));
    expect(chaves(solicitacao)).toEqual(['codigo', 'excluida', 'id']);
    expect(solicitacao?.required?.sort()).toEqual(['codigo', 'excluida', 'id']);
    expect(campo(solicitacao, 'excluida')?.type).toBe('boolean');
    expect(campo(divergencia, 'eventoId')?.format).toBe('uuid');
    expect(campo(divergencia, 'criadoEm')?.format).toBe('date-time');
    expect(campo(divergencia, 'tipo')?.enum?.sort()).toEqual(
      [
        'ANALISE_INICIADA',
        'APROVADA',
        'CRIADA',
        'EDITADA',
        'EXCLUIDA',
        'REABERTA',
        'REJEITADA',
      ].sort(),
    );
  });

  it('RN-10: motivo é enum CONTEUDO_ALTERADO | CORRENTE_QUEBRADA', () => {
    const divergencia = resolver(campo(resposta(), 'divergencias')?.items);
    expect(campo(divergencia, 'motivo')?.enum?.sort()).toEqual([
      'CONTEUDO_ALTERADO',
      'CORRENTE_QUEBRADA',
    ]);
  });
});
