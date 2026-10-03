import { randomUUID } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import type { Client } from 'pg';
import { urlBanco } from './ambiente';
import { conectar, criarBancoMigrado } from './banco';
import { rodarBinario } from './prisma-cli';

const SENHA_SEED = 'Senha-de-teste@2026';

const AREAS = [
  'Comercial',
  'Financeiro',
  'Jurídico',
  'Operações',
  'Recursos Humanos',
  'Tecnologia',
];

// Usuários de demonstração da nota de usuários e permissões.
const USUARIOS = [
  { nome: 'Ana Souza', cargo: 'SOLICITANTE', area: 'Financeiro' },
  { nome: 'Bruno Lima', cargo: 'SOLICITANTE', area: 'Recursos Humanos' },
  { nome: 'Camila Rocha', cargo: 'SOLICITANTE', area: 'Comercial' },
  { nome: 'Carla Mendes', cargo: 'ANALISTA', area: 'Tecnologia' },
  { nome: 'Diego Alves', cargo: 'ADMIN', area: 'Tecnologia' },
  { nome: 'Rafael Costa', cargo: 'ANALISTA', area: 'Tecnologia' },
];

interface LinhaUsuario {
  nome: string;
  email: string;
  cargo: string;
  area: string;
  ativo: boolean;
  senha_hash: string;
}

describe('P-10: seed de áreas, usuários e solicitações', () => {
  let banco: string;
  let owner: Client;

  function rodarSeed(): void {
    const resultado = rodarBinario('tsx', ['prisma/seed.ts'], {
      MIGRATION_DATABASE_URL: urlBanco('owner', banco),
      SEED_PASSWORD: SENHA_SEED,
    });
    if (resultado.status !== 0) {
      throw new Error(`O seed falhou:\n${resultado.saida}`);
    }
  }

  async function usuarios(): Promise<LinhaUsuario[]> {
    const resultado = await owner.query<LinhaUsuario>(
      `SELECT u.nome, u.email, u.cargo::text AS cargo, a.nome AS area, u.ativo, u.senha_hash
         FROM usuarios u JOIN areas a ON a.id = u.area_id
`,
    );
    return resultado.rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Retrato das solicitações e do histórico depois da primeira e da segunda execução do seed.
  let primeiraExecucao: { solicitacoes: unknown[]; historico: unknown[] };
  let segundaExecucao: { solicitacoes: unknown[]; historico: unknown[] };
  let fimDoSeed: number;

  async function retrato(): Promise<{ solicitacoes: unknown[]; historico: unknown[] }> {
    const solicitacoes = await owner.query(
      `SELECT id, codigo, titulo, descricao, prioridade::text, status::text, solicitante_id, area_id,
              analista_id, data_solicitacao, decisao_comentario, decidido_em, decidido_por_id, versao,
              atualizado_em, excluido_em
         FROM solicitacoes ORDER BY id`,
    );
    const historico = await owner.query(
      `SELECT id, solicitacao_id, tipo::text, status_anterior::text, status_novo::text, comentario,
              autor_id, dados, criado_em
         FROM solicitacao_historico ORDER BY id`,
    );
    return { solicitacoes: solicitacoes.rows, historico: historico.rows };
  }

  beforeAll(async () => {
    banco = `seed_${randomUUID().replaceAll('-', '')}`;
    await criarBancoMigrado(banco);
    owner = await conectar('owner', banco);
    rodarSeed();
    primeiraExecucao = await retrato();
    rodarSeed();
    fimDoSeed = Date.now();
    segundaExecucao = await retrato();
  });

  afterAll(async () => {
    await owner.end();
  });

  it('P-10: rodar o seed duas vezes mantém 6 áreas e 6 usuários', async () => {
    const areas = await owner.query<{ nome: string }>('SELECT nome FROM areas');
    const nomes = areas.rows.map((linha) => linha.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(nomes).toEqual(AREAS);
    expect(await usuarios()).toHaveLength(6);
  });

  it('P-10: cargos e áreas dos usuários conforme a matriz de usuários', async () => {
    const lidos = (await usuarios()).map(({ nome, cargo, area, ativo }) => ({
      nome,
      cargo,
      area,
      ativo,
    }));
    expect(lidos).toEqual(USUARIOS.map((usuario) => ({ ...usuario, ativo: true })));
  });

  it('P-10: e-mails gravados em minúsculas', async () => {
    for (const { email } of await usuarios()) {
      expect(email).toBe(email.toLowerCase());
    }
  });

  it('P-10: a senha SEED_PASSWORD confere com o hash argon2id de cada usuário', async () => {
    for (const { senha_hash } of await usuarios()) {
      expect(senha_hash.startsWith('$argon2id$')).toBe(true);
      await expect(verify(senha_hash, SENHA_SEED)).resolves.toBe(true);
      await expect(verify(senha_hash, 'outra-senha')).resolves.toBe(false);
    }
  });
  describe('P-10: solicitações de demonstração', () => {
    interface LinhaSolicitacao {
      id: string;
      status: string;
      prioridade: string;
      solicitante: string;
      analista: string | null;
      decisor: string | null;
      solicitante_id: string;
      analista_id: string | null;
      decidido_por_id: string | null;
      data_solicitacao: Date;
      excluido_em: Date | null;
    }

    interface LinhaEvento {
      solicitacao_id: string;
      tipo: string;
      status_anterior: string | null;
      status_novo: string | null;
      autor: string;
      autor_id: string;
      criado_em: Date;
    }

    let solicitacoes: LinhaSolicitacao[];
    let eventos: LinhaEvento[];

    function eventosDe(id: string): LinhaEvento[] {
      return eventos.filter((evento) => evento.solicitacao_id === id);
    }

    beforeAll(async () => {
      const resultado = await owner.query<LinhaSolicitacao>(
        `SELECT s.id, s.status::text AS status, s.prioridade::text AS prioridade,
                us.nome AS solicitante, ua.nome AS analista, ud.nome AS decisor,
                s.solicitante_id, s.analista_id, s.decidido_por_id, s.data_solicitacao, s.excluido_em
           FROM solicitacoes s
           JOIN usuarios us ON us.id = s.solicitante_id
           LEFT JOIN usuarios ua ON ua.id = s.analista_id
           LEFT JOIN usuarios ud ON ud.id = s.decidido_por_id`,
      );
      solicitacoes = resultado.rows;
      const historico = await owner.query<LinhaEvento>(
        `SELECT h.solicitacao_id, h.tipo::text AS tipo, h.status_anterior::text AS status_anterior,
                h.status_novo::text AS status_novo, u.nome AS autor, h.autor_id, h.criado_em
           FROM solicitacao_historico h JOIN usuarios u ON u.id = h.autor_id
          ORDER BY h.solicitacao_id, h.criado_em, h.id`,
      );
      eventos = historico.rows;
    });

    it('P-10: o seed cria 40 solicitações, nenhuma excluída', () => {
      expect(solicitacoes).toHaveLength(40);
      expect(solicitacoes.filter((linha) => linha.excluido_em !== null)).toEqual([]);
    });

    it('P-10: rodar o seed de novo não duplica nem altera solicitações e histórico', () => {
      expect(segundaExecucao.solicitacoes).toHaveLength(40);
      expect(segundaExecucao).toEqual(primeiraExecucao);
    });

    it('P-10: rodar o seed de novo não consome a sequência do código: a próxima é SOL-000041', async () => {
      const sequencia = await owner.query<{ last_value: string; is_called: boolean }>(
        'SELECT last_value::text AS last_value, is_called FROM solicitacoes_codigo_seq',
      );
      // Depois de 40 códigos usados (1 a 40), o próximo nextval tem de ser 41, sem buraco.
      expect(sequencia.rows[0]).toEqual({ last_value: '40', is_called: true });
    });

    it('P-10: os códigos do seed vão de 1 a 40, na ordem das datas de abertura', async () => {
      const resultado = await owner.query<{ codigo: number; data_solicitacao: Date }>(
        'SELECT codigo, data_solicitacao FROM solicitacoes ORDER BY codigo',
      );
      const codigos = resultado.rows.map((linha) => linha.codigo);
      expect(codigos).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      // codigo crescente ⇔ data_solicitacao crescente: a mais antiga tem o menor código.
      const datas = resultado.rows.map((linha) => linha.data_solicitacao.getTime());
      for (let i = 1; i < datas.length; i++) {
        expect({ codigo: codigos[i], naoAnterior: datas[i]! >= datas[i - 1]! }).toEqual({
          codigo: codigos[i],
          naoAnterior: true,
        });
      }
    });

    it('P-10: distribuição 10 ABERTA, 7 EM_ANALISE, 15 APROVADA, 8 REJEITADA', () => {
      const porStatus: Record<string, number> = {};
      for (const { status } of solicitacoes) porStatus[status] = (porStatus[status] ?? 0) + 1;
      expect(porStatus).toEqual({ ABERTA: 10, EM_ANALISE: 7, APROVADA: 15, REJEITADA: 8 });
    });

    it.each(['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'])(
      'P-10: %s tem as três prioridades',
      (status) => {
        const prioridades = new Set(
          solicitacoes.filter((linha) => linha.status === status).map((linha) => linha.prioridade),
        );
        expect([...prioridades].sort()).toEqual(['ALTA', 'BAIXA', 'MEDIA']);
      },
    );

    it('P-10: datas nos últimos 60 dias', () => {
      const limite = fimDoSeed - 60 * 24 * 60 * 60 * 1000 - 60_000;
      for (const { data_solicitacao } of solicitacoes) {
        expect(data_solicitacao.getTime()).toBeGreaterThanOrEqual(limite);
        expect(data_solicitacao.getTime()).toBeLessThanOrEqual(fimDoSeed);
      }
    });

    it('RN-07: nenhuma com analista ou decisor igual ao solicitante', () => {
      for (const linha of solicitacoes) {
        expect(linha.analista_id).not.toBe(linha.solicitante_id);
        expect(linha.decidido_por_id).not.toBe(linha.solicitante_id);
      }
    });

    it('P-10: a maioria aberta por Ana, Bruno e Camila, e algumas pela Carla e pelo Rafael', () => {
      const porSolicitante: Record<string, number> = {};
      for (const { solicitante } of solicitacoes) {
        porSolicitante[solicitante] = (porSolicitante[solicitante] ?? 0) + 1;
      }
      const solicitantes =
        (porSolicitante['Ana Souza'] ?? 0) +
        (porSolicitante['Bruno Lima'] ?? 0) +
        (porSolicitante['Camila Rocha'] ?? 0);
      expect(solicitantes).toBeGreaterThan(20);
      for (const nome of [
        'Ana Souza',
        'Bruno Lima',
        'Camila Rocha',
        'Carla Mendes',
        'Rafael Costa',
      ]) {
        expect(porSolicitante[nome] ?? 0).toBeGreaterThan(0);
      }
    });

    it('P-10: há ABERTA de prioridade ALTA e EM_ANALISE da Carla e do Rafael', () => {
      expect(
        solicitacoes.some((linha) => linha.status === 'ABERTA' && linha.prioridade === 'ALTA'),
      ).toBe(true);
      for (const analista of ['Carla Mendes', 'Rafael Costa']) {
        expect(
          solicitacoes.some(
            (linha) => linha.status === 'EM_ANALISE' && linha.analista === analista,
          ),
        ).toBe(true);
      }
    });

    it('RN-16: pelo menos 3 reabertas pelo Diego, logo depois de uma decisão', () => {
      const reaberturas = eventos.filter((evento) => evento.tipo === 'REABERTA');
      expect(
        new Set(reaberturas.map((evento) => evento.solicitacao_id)).size,
      ).toBeGreaterThanOrEqual(3);
      for (const reabertura of reaberturas) {
        expect(reabertura.autor).toBe('Diego Alves');
        const linha = eventosDe(reabertura.solicitacao_id);
        const anterior = linha[linha.indexOf(reabertura) - 1];
        expect(['APROVADA', 'REJEITADA']).toContain(anterior?.tipo);
        expect(reabertura).toMatchObject({
          status_anterior: anterior?.tipo,
          status_novo: 'ABERTA',
        });
      }
    });

    it('RN-10: cada histórico começa em CRIADA pelo solicitante, com datas crescentes', () => {
      for (const linha of solicitacoes) {
        const historico = eventosDe(linha.id);
        expect(historico[0]).toMatchObject({
          tipo: 'CRIADA',
          status_novo: 'ABERTA',
          autor_id: linha.solicitante_id,
        });
        const datas = historico.map((evento) => evento.criado_em.getTime());
        expect(datas).toEqual([...datas].sort((a, b) => a - b));
        expect(datas[0]).toBeGreaterThanOrEqual(linha.data_solicitacao.getTime());
        expect(datas[datas.length - 1]).toBeLessThanOrEqual(fimDoSeed);
      }
    });

    it('RN-10: o último status_novo do histórico é o status atual', () => {
      for (const linha of solicitacoes) {
        const mudancas = eventosDe(linha.id).filter((evento) => evento.status_novo !== null);
        expect({ id: linha.id, status: mudancas[mudancas.length - 1]?.status_novo }).toEqual({
          id: linha.id,
          status: linha.status,
        });
      }
    });

    it('RN-04 / RN-05 / RN-07: análise e decisão no histórico por analista ou admin, nunca pelo solicitante', () => {
      const tiposDeComando = ['ANALISE_INICIADA', 'APROVADA', 'REJEITADA', 'REABERTA'];
      for (const linha of solicitacoes) {
        for (const evento of eventosDe(linha.id)) {
          if (!tiposDeComando.includes(evento.tipo)) continue;
          expect(evento.autor_id).not.toBe(linha.solicitante_id);
          expect(['Carla Mendes', 'Rafael Costa', 'Diego Alves']).toContain(evento.autor);
        }
      }
    });

    it('RN-05: a decisão atual foi tomada pelo responsável ou pelo Diego', () => {
      for (const linha of solicitacoes.filter(
        (l) => l.status === 'APROVADA' || l.status === 'REJEITADA',
      )) {
        expect([linha.analista, 'Diego Alves']).toContain(linha.decisor);
      }
    });
  });
});
