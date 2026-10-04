import { gerarDocumentoOpenApi } from './documento-openapi';

interface Esquema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  nullable?: boolean;
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

const GESTAO = '/api/v1/dashboard/gestao';
const ANULAVEL = /"nullable":true|"type":"null"|"type":\["[a-z]+","null"\]/;

/** PR 4C: GET /dashboard/gestao (painel de gestão do Admin). */
describe('RF-04: contrato OpenAPI do painel de gestão (PR 4C)', () => {
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

  const operacao = () => documento.paths[GESTAO]?.get;
  const resposta = () =>
    resolver(operacao()?.responses?.['200']?.content?.['application/json']?.schema);
  const campo = (esquema: Esquema | undefined, nome: string) =>
    resolver(esquema?.properties?.[nome]);
  const chaves = (esquema: Esquema | undefined) => Object.keys(esquema?.properties ?? {}).sort();

  /** Confere que o campo é obrigatório e anulável no objeto. */
  function esperarAnulavel(objeto: Esquema | undefined, nome: string): void {
    expect(objeto?.required).toContain(nome);
    expect(JSON.stringify(objeto?.properties?.[nome])).toMatch(ANULAVEL);
  }

  it('RF-04: GET /dashboard/gestao existe, exige Bearer e documenta 200, 400, 401 e 403', () => {
    expect(operacao()).toBeDefined();
    expect(operacao()?.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operacao()?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
    for (const codigo of ['400', '401', '403']) {
      expect(JSON.stringify(operacao()?.responses?.[codigo])).toContain(
        '#/components/schemas/ProblemDetails',
      );
    }
  });

  it('RF-04: periodo é query opcional com hoje, 7d, 30d e tudo', () => {
    const periodo = operacao()?.parameters?.find((parametro) => parametro.name === 'periodo');
    expect(periodo).toMatchObject({ in: 'query' });
    expect(periodo?.required ?? false).toBe(false);
    expect(resolver(periodo?.schema)?.enum?.sort()).toEqual(['30d', '7d', 'hoje', 'tudo']);
  });

  it('RF-04: resposta tem periodo, entradaSaida, porArea, porAnalista, integracoesComFalha e geradoEm', () => {
    const corpo = resposta();
    const blocos = [
      'entradaSaida',
      'geradoEm',
      'integracoesComFalha',
      'periodo',
      'porAnalista',
      'porArea',
    ];
    expect(chaves(corpo)).toEqual(blocos.sort());
    expect(corpo?.required?.sort()).toEqual(blocos.sort());
    expect(campo(corpo, 'geradoEm')?.format).toBe('date-time');

    const periodo = campo(corpo, 'periodo');
    expect(chaves(periodo)).toEqual(['fim', 'granularidade', 'inicio', 'valor']);
    expect(campo(periodo, 'valor')?.enum?.sort()).toEqual(['30d', '7d', 'hoje', 'tudo']);
    expect(campo(periodo, 'fim')?.format).toBe('date-time');
    expect(campo(periodo, 'inicio')?.format).toBe('date-time');
    esperarAnulavel(periodo, 'inicio');
    esperarAnulavel(periodo, 'granularidade');
    expect(campo(periodo, 'granularidade')?.enum?.sort()).toEqual(['dia', 'mes', 'semana']);
  });

  it('RF-04: entradaSaida com anterior, tempo médio e mais antiga anuláveis e a série', () => {
    const entradaSaida = campo(resposta(), 'entradaSaida');
    expect(chaves(entradaSaida)).toEqual(
      [
        'anterior',
        'aprovadas',
        'entraram',
        'maisAntigaNaFila',
        'pendentesPorPrioridade',
        'prioridadeEntraram',
        'rejeitadas',
        'saldo',
        'sairam',
        'serie',
        'tempoMedioDecisaoDias',
      ].sort(),
    );
    for (const nome of ['anterior', 'tempoMedioDecisaoDias', 'maisAntigaNaFila']) {
      esperarAnulavel(entradaSaida, nome);
    }
    const anterior = campo(entradaSaida, 'anterior');
    expect(chaves(anterior)).toEqual(['entraram', 'sairam', 'tempoMedioDecisaoDias']);
    esperarAnulavel(anterior, 'tempoMedioDecisaoDias');
    expect(chaves(campo(entradaSaida, 'maisAntigaNaFila'))).toEqual([
      'area',
      'codigo',
      'desde',
      'id',
    ]);
    for (const nome of ['prioridadeEntraram', 'pendentesPorPrioridade']) {
      expect(chaves(campo(entradaSaida, nome))).toEqual(['ALTA', 'BAIXA', 'MEDIA']);
    }
    const balde = resolver(campo(entradaSaida, 'serie')?.items);
    expect(chaves(balde)).toEqual(['entraram', 'inicio', 'sairam']);
    expect(campo(balde, 'inicio')?.format).toBe('date-time');
  });

  it('RF-04: porArea e porAnalista (taxaAprovacao anulável)', () => {
    const area = resolver(campo(resposta(), 'porArea')?.items);
    expect(chaves(area)).toEqual(['area', 'porStatus', 'total']);
    expect(chaves(campo(area, 'area'))).toEqual(['id', 'nome']);
    expect(chaves(campo(area, 'porStatus'))).toEqual([
      'ABERTA',
      'APROVADA',
      'EM_ANALISE',
      'REJEITADA',
    ]);

    const analista = resolver(campo(resposta(), 'porAnalista')?.items);
    expect(chaves(analista)).toEqual(
      ['analista', 'aprovadas', 'decididas', 'emAnaliseAgora', 'taxaAprovacao'].sort(),
    );
    esperarAnulavel(analista, 'taxaAprovacao');
  });

  it('RN-14: integracoesComFalha com solicitação, tentativas, maxTentativas, ultimoErro e ultimaTentativaEm', () => {
    const linha = resolver(campo(resposta(), 'integracoesComFalha')?.items);
    expect(chaves(linha)).toEqual(
      [
        'maxTentativas',
        'solicitacao',
        'tentativas',
        'tipo',
        'ultimaTentativaEm',
        'ultimoErro',
      ].sort(),
    );
    expect(chaves(campo(linha, 'solicitacao'))).toEqual(
      ['area', 'codigo', 'id', 'solicitante', 'titulo'].sort(),
    );
    esperarAnulavel(linha, 'ultimoErro');
    esperarAnulavel(linha, 'ultimaTentativaEm');
    expect(campo(linha, 'ultimaTentativaEm')?.format).toBe('date-time');
  });
});
