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

interface Parametro {
  name: string;
  in: string;
  schema?: Esquema;
}

interface DocumentoOpenApi {
  paths: Record<string, Record<string, { parameters?: Parametro[] }>>;
  components: { schemas: Record<string, Esquema> };
}

/** PR 4B: campos do dashboard por cargo no item da lista (GET /solicitacoes). */
describe('RF-02/RF-03: contrato OpenAPI do item da lista para o dashboard (PR 4B)', () => {
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

  function itemLista(): Esquema | undefined {
    const pagina = resolver(documento.components.schemas.PaginaSolicitacoesDto);
    return resolver(resolver(pagina?.properties?.data)?.items);
  }

  const ANULAVEL = /"nullable":true|"type":"null"|"type":\["[a-z]+","null"\]/;

  it('RF-02: item da lista tem analiseIniciadaEm obrigatório, anulável e date-time', () => {
    const item = itemLista();
    expect(item?.properties).toBeDefined();
    const propriedade = item?.properties?.analiseIniciadaEm;
    expect(propriedade).toBeDefined();
    expect(item?.required).toContain('analiseIniciadaEm');
    expect(JSON.stringify(propriedade)).toMatch(ANULAVEL);
    expect(resolver(propriedade)?.format).toBe('date-time');
  });

  it('RF-03: item da lista tem decisao obrigatória e anulável, com os campos do detalhe', () => {
    const item = itemLista();
    const propriedade = item?.properties?.decisao;
    expect(propriedade).toBeDefined();
    expect(item?.required).toContain('decisao');
    expect(JSON.stringify(propriedade)).toMatch(ANULAVEL);

    const decisao = resolver(propriedade);
    expect(Object.keys(decisao?.properties ?? {}).sort()).toEqual(
      ['comentario', 'decididoEm', 'decididoPor', 'resultado'].sort(),
    );
    expect(resolver(decisao?.properties?.resultado)?.enum?.sort()).toEqual([
      'APROVADA',
      'REJEITADA',
    ]);
    expect(resolver(decisao?.properties?.decididoEm)?.format).toBe('date-time');
    expect(
      Object.keys(resolver(decisao?.properties?.decididoPor)?.properties ?? {}).sort(),
    ).toEqual(['id', 'nome']);
  });

  it('RF-03: a decisao do item tem a mesma forma da decisao do detalhe (SolicitacaoDto)', () => {
    const doItem = resolver(itemLista()?.properties?.decisao);
    const doDetalhe = resolver(documento.components.schemas.SolicitacaoDto?.properties?.decisao);
    expect(doItem?.properties).toBeDefined();
    expect(doItem?.properties).toEqual(doDetalhe?.properties);
    expect(doItem?.required?.sort()).toEqual(doDetalhe?.required?.sort());
  });

  it('RF-02: GET /solicitacoes documenta ordenarPor=decididoEm sem perder os valores atuais', () => {
    const ordenarPor = documento.paths['/api/v1/solicitacoes']?.get?.parameters?.find(
      (parametro) => parametro.name === 'ordenarPor',
    );
    expect(ordenarPor).toMatchObject({ in: 'query' });
    expect(resolver(ordenarPor?.schema)?.enum?.sort()).toEqual(
      ['dataSolicitacao', 'decididoEm', 'prioridade'].sort(),
    );
  });
});
