import { describe, expect, it } from 'vitest';
import { paramsComoObjeto } from '@/test/dom';
import { lerFiltros, montarQuery } from './filtros';

const PADRAO = {
  status: [],
  prioridade: [],
  ordenarPor: 'dataSolicitacao',
  direcao: 'desc',
  page: 1,
};

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
        ordenarPor: 'prioridade',
        direcao: 'asc',
        analista: 'eu',
        page: '2',
      }),
    ).toEqual({
      q: 'acesso',
      status: ['ABERTA', 'EM_ANALISE'],
      prioridade: ['ALTA'],
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
