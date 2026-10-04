import { describe, expect, it } from 'vitest';
import { paramsComoObjeto } from '@/test/dom';
import { lerFiltros, montarQuery, temFiltroAtivo } from './filtros';

const PADRAO = {
  status: [],
  prioridade: [],
  area: [],
  ordenarPor: 'dataSolicitacao',
  direcao: 'desc',
  page: 1,
};

const AREA_FINANCEIRO = 'a0000000-0000-4000-8000-000000000001';
const AREA_TECNOLOGIA = 'a0000000-0000-4000-8000-000000000002';

/** Parâmetros gerados por montarQuery, como objeto (aceita com ou sem "?" na frente). */
const query = (texto: string) => paramsComoObjeto(new URLSearchParams(texto.replace(/^\?/, '')));

describe('RF-02: lerFiltros (estado da lista na URL)', () => {
  it('RF-02: sem parâmetros, aplica os padrões', () => {
    expect(lerFiltros({})).toEqual(PADRAO);
  });

  it('RF-02: lê todos os filtros válidos', () => {
    expect(
      lerFiltros({
        q: 'acesso',
        status: ['ABERTA', 'EM_ANALISE'],
        prioridade: 'ALTA',
        area: AREA_FINANCEIRO,
        ordenarPor: 'prioridade',
        direcao: 'asc',
        analista: 'eu',
        page: '2',
      }),
    ).toEqual({
      q: 'acesso',
      status: ['ABERTA', 'EM_ANALISE'],
      prioridade: ['ALTA'],
      area: [AREA_FINANCEIRO],
      ordenarPor: 'prioridade',
      direcao: 'asc',
      analista: 'eu',
      page: 2,
    });
  });

  it('RF-02: aceita URLSearchParams (lado do cliente) com valores repetidos', () => {
    const params = new URLSearchParams('status=APROVADA&status=REJEITADA&prioridade=BAIXA&page=3');
    expect(lerFiltros(params)).toEqual({
      ...PADRAO,
      status: ['APROVADA', 'REJEITADA'],
      prioridade: ['BAIXA'],
      page: 3,
    });
  });

  it('RF-02: ignora status e prioridade desconhecidos, mantendo os válidos', () => {
    expect(
      lerFiltros({ status: ['ABERTA', 'XPTO', 'aberta'], prioridade: ['URGENTE', 'MEDIA'] }),
    ).toEqual({ ...PADRAO, status: ['ABERTA'], prioridade: ['MEDIA'] });
  });

  it.each(['0', '-2', 'abc', ''])('RF-02: page inválida (%j) vira 1', (page) => {
    expect(lerFiltros({ page }).page).toBe(1);
  });

  it.each([['a'], [' a '], ['   ']])(
    'RF-02: busca com menos de 2 caracteres (%j) é ignorada',
    (q) => {
      expect(lerFiltros({ q }).q).toBeUndefined();
    },
  );

  it('RF-02: busca válida é lida sem os espaços nas pontas', () => {
    expect(lerFiltros({ q: '  folha  ' }).q).toBe('folha');
  });

  it('RF-02: ordenação, direção e analista inválidos voltam ao padrão', () => {
    expect(lerFiltros({ ordenarPor: 'titulo', direcao: 'cima', analista: 'outro' })).toEqual(
      PADRAO,
    );
  });
});

describe('RF-02: filtro por analista (painel de gestão)', () => {
  const CARLA_ID = 'c0000000-0000-4000-8000-000000000004';

  it('RF-02: analista=<uuid> é lido e volta para a URL (linha do analista no painel)', () => {
    const filtros = lerFiltros({ analista: CARLA_ID, status: 'EM_ANALISE' });

    expect(filtros.analista).toBe(CARLA_ID);
    expect(query(montarQuery(filtros))).toMatchObject({
      analista: CARLA_ID,
      status: 'EM_ANALISE',
    });
  });

  it('RF-02: analista que não é "eu" nem UUID é ignorado', () => {
    expect(lerFiltros({ analista: 'carla' }).analista).toBeUndefined();
  });
});

describe('RF-02: montarQuery (filtros → URL)', () => {
  it('RF-02: com os padrões, a query fica vazia', () => {
    expect(montarQuery(lerFiltros({}))).toBe('');
  });

  it('RF-02: omite page 1, direcao desc e ordenarPor dataSolicitacao', () => {
    const texto = montarQuery({ ...lerFiltros({}), q: 'acesso' });
    expect(query(texto)).toEqual({ q: 'acesso' });
  });

  it('RF-02: repete status e prioridade e inclui o que não é padrão', () => {
    const texto = montarQuery({
      q: 'acesso',
      status: ['ABERTA', 'EM_ANALISE'],
      prioridade: ['ALTA', 'BAIXA'],
      area: [],
      ordenarPor: 'dataSolicitacao',
      direcao: 'asc',
      page: 2,
    });

    const params = new URLSearchParams(texto.replace(/^\?/, ''));
    expect(params.getAll('status')).toEqual(['ABERTA', 'EM_ANALISE']);
    expect(params.getAll('prioridade')).toEqual(['ALTA', 'BAIXA']);
    expect(query(texto)).toEqual({
      q: 'acesso',
      status: ['ABERTA', 'EM_ANALISE'],
      prioridade: ['ALTA', 'BAIXA'],
      direcao: 'asc',
      page: '2',
    });
  });

  it.each([
    ['padrões', {}],
    ['busca e status', { q: 'folha', status: ['ABERTA', 'REJEITADA'] }],
    [
      'tudo preenchido',
      {
        q: 'SOL-000042',
        status: ['EM_ANALISE'],
        prioridade: ['MEDIA', 'ALTA'],
        area: [AREA_FINANCEIRO, AREA_TECNOLOGIA],
        ordenarPor: 'prioridade',
        direcao: 'asc',
        analista: 'eu',
        page: '4',
      },
    ],
  ])('RF-02: ida e volta preserva os filtros (%s)', (_nome, entrada) => {
    const filtros = lerFiltros(entrada as Record<string, string | string[]>);
    expect(lerFiltros(new URLSearchParams(montarQuery(filtros).replace(/^\?/, '')))).toEqual(
      filtros,
    );
  });
});

describe('RF-02: filtro por área na URL', () => {
  it('RF-02: lê ?area= repetido da URL (lado do cliente e do servidor)', () => {
    const params = new URLSearchParams(`area=${AREA_FINANCEIRO}&area=${AREA_TECNOLOGIA}`);
    expect(lerFiltros(params).area).toEqual([AREA_FINANCEIRO, AREA_TECNOLOGIA]);
    expect(lerFiltros({ area: [AREA_FINANCEIRO, AREA_TECNOLOGIA] }).area).toEqual([
      AREA_FINANCEIRO,
      AREA_TECNOLOGIA,
    ]);
    expect(lerFiltros({ area: AREA_TECNOLOGIA }).area).toEqual([AREA_TECNOLOGIA]);
  });

  it('RF-02: descarta valores de área que não são UUID, mantendo os válidos', () => {
    expect(
      lerFiltros({
        area: [
          'Financeiro',
          AREA_FINANCEIRO,
          '123',
          '',
          'a0000000000040008000000000000001',
          'a0000000-0000-4000-8000-00000000000z',
          `${AREA_TECNOLOGIA}x`,
        ],
      }).area,
    ).toEqual([AREA_FINANCEIRO]);
  });

  it('RF-02: sem ?area=, a lista de áreas fica vazia', () => {
    expect(lerFiltros(new URLSearchParams('status=ABERTA')).area).toEqual([]);
  });

  it('RF-02: montarQuery repete ?area= para cada área escolhida', () => {
    const texto = montarQuery({ ...lerFiltros({}), area: [AREA_FINANCEIRO, AREA_TECNOLOGIA] });

    const params = new URLSearchParams(texto.replace(/^\?/, ''));
    expect(params.getAll('area')).toEqual([AREA_FINANCEIRO, AREA_TECNOLOGIA]);
    expect(query(texto)).toEqual({ area: [AREA_FINANCEIRO, AREA_TECNOLOGIA] });
  });

  it('RF-02: área escolhida conta como filtro ativo', () => {
    expect(temFiltroAtivo(lerFiltros({}))).toBe(false);
    expect(temFiltroAtivo(lerFiltros({ area: AREA_FINANCEIRO }))).toBe(true);
  });
});
