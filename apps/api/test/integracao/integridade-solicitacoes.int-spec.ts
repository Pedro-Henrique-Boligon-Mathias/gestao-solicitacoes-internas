import type { Client } from 'pg';
import {
  SQLSTATE,
  conectar,
  criarPessoas,
  decisaoCompleta,
  inserirSolicitacao,
  type CamposSolicitacao,
  type Pessoas,
} from './banco';

// As constraints valem para qualquer papel. Os inserts usam app_owner para que a RLS
// (que chega na Fase 2) não mascare a violação de CHECK que está sendo testada.
describe('Integridade de solicitacoes (constraints do banco)', () => {
  let owner: Client;
  let pessoas: Pessoas;

  beforeAll(async () => {
    owner = await conectar('owner');
    pessoas = await criarPessoas(owner);
  });

  afterAll(async () => {
    await owner.end();
  });

  function inserir(campos: CamposSolicitacao): Promise<string> {
    return inserirSolicitacao(owner, pessoas, campos);
  }

  describe('RN-07: segregação de funções', () => {
    it('RN-07: o banco recusa analista igual ao solicitante', async () => {
      await expect(
        inserir({ status: 'EM_ANALISE', analista_id: pessoas.solicitanteId }),
      ).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
    });

    it('RN-07: o banco recusa decisão tomada pelo próprio solicitante', async () => {
      await expect(
        inserir({
          status: 'APROVADA',
          analista_id: pessoas.analistaId,
          ...decisaoCompleta(pessoas.solicitanteId),
        }),
      ).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
    });

    it('RN-07: o banco aceita análise e decisão feitas por outra pessoa', async () => {
      await expect(
        inserir({
          status: 'APROVADA',
          analista_id: pessoas.analistaId,
          ...decisaoCompleta(pessoas.analistaId),
        }),
      ).resolves.toEqual(expect.any(String));
    });
  });

  describe('RN-06: decisão completa se, e somente se, o status for final', () => {
    const faltando: [string, CamposSolicitacao][] = [
      ['sem comentário', { decisao_comentario: null }],
      ['sem data', { decidido_em: null }],
      ['sem autor', { decidido_por_id: null }],
      [
        'sem nenhum campo de decisão',
        { decisao_comentario: null, decidido_em: null, decidido_por_id: null },
      ],
    ];

    it.each(['APROVADA', 'REJEITADA'])(
      'RN-06: o banco aceita %s com os três campos de decisão',
      async (status) => {
        await expect(
          inserir({
            status,
            analista_id: pessoas.analistaId,
            ...decisaoCompleta(pessoas.analistaId),
          }),
        ).resolves.toEqual(expect.any(String));
      },
    );

    const combinacoes = ['APROVADA', 'REJEITADA'].flatMap((status) =>
      faltando.map(([descricao, ausentes]) => [status, descricao, ausentes] as const),
    );

    it.each(combinacoes)('RN-06: o banco recusa %s %s', async (status, _descricao, ausentes) => {
      await expect(
        inserir({
          status,
          analista_id: pessoas.analistaId,
          ...decisaoCompleta(pessoas.analistaId),
          ...ausentes,
        }),
      ).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
    });

    // A CHECK da nota do modelo de dados compara o status final com a decisão completa.
    it.each(['ABERTA', 'EM_ANALISE'])(
      'RN-06: o banco recusa os campos de decisão com status %s',
      async (status) => {
        await expect(
          inserir({
            status,
            analista_id: pessoas.analistaId,
            ...decisaoCompleta(pessoas.analistaId),
          }),
        ).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
      },
    );
  });

  describe('RN-04: em análise exige analista responsável', () => {
    it('RN-04: o banco recusa EM_ANALISE sem analista', async () => {
      await expect(inserir({ status: 'EM_ANALISE', analista_id: null })).rejects.toMatchObject({
        code: SQLSTATE.violacaoCheck,
      });
    });

    it('RN-04: o banco aceita EM_ANALISE com analista', async () => {
      await expect(
        inserir({ status: 'EM_ANALISE', analista_id: pessoas.analistaId }),
      ).resolves.toEqual(expect.any(String));
    });
  });

  describe('RF-01: título e descrição', () => {
    it.each([
      ['vazio', ''],
      ['com 4 caracteres', 'Wifi'],
      ['com 4 caracteres e espaços nas pontas', '   Wifi   '],
      ['só com espaços', '          '],
    ])('RF-01: o banco recusa título %s', async (_descricao, titulo) => {
      await expect(inserir({ titulo })).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
    });

    it('RF-01: o banco aceita título com 5 caracteres', async () => {
      await expect(inserir({ titulo: 'Wi-Fi' })).resolves.toEqual(expect.any(String));
    });

    it.each([
      ['com 9 caracteres', 'a'.repeat(9)],
      ['com 5001 caracteres', 'a'.repeat(5001)],
    ])('RF-01: o banco recusa descrição %s', async (_descricao, descricao) => {
      await expect(inserir({ descricao })).rejects.toMatchObject({ code: SQLSTATE.violacaoCheck });
    });

    it.each([
      ['com 10 caracteres', 'a'.repeat(10)],
      ['com 5000 caracteres', 'a'.repeat(5000)],
    ])('RF-01: o banco aceita descrição %s', async (_descricao, descricao) => {
      await expect(inserir({ descricao })).resolves.toEqual(expect.any(String));
    });
  });
});
