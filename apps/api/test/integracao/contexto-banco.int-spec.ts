import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Client } from 'pg';
import { AppModule } from '../../src/app.module';
import { ContextoBanco } from '../../src/database/contexto-banco';
import { conectar, criarPessoas, type Pessoas } from './banco';

interface LinhaContexto {
  usuario: string | null;
  cargo: string | null;
}

// A API conecta como app_runtime (DATABASE_URL do setup global).
describe('ADR-005: transação com contexto (ContextoBanco)', () => {
  let app: INestApplication;
  let contexto: ContextoBanco;
  let owner: Client;
  let pessoas: Pessoas;

  beforeAll(async () => {
    owner = await conectar('owner');
    pessoas = await criarPessoas(owner);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    contexto = app.get(ContextoBanco);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  async function lerContexto(): Promise<LinhaContexto> {
    const linhas = await contexto.cliente.$queryRaw<LinhaContexto[]>`
      SELECT app.usuario_atual()::text AS usuario, app.cargo_atual() AS cargo`;
    return linhas[0]!;
  }

  async function contarPorTitulo(titulo: string): Promise<number> {
    const resultado = await owner.query('SELECT 1 FROM solicitacoes WHERE titulo = $1', [titulo]);
    return resultado.rowCount ?? 0;
  }

  async function inserirSolicitacaoNoContexto(titulo: string): Promise<void> {
    await contexto.cliente.$executeRaw`
      INSERT INTO solicitacoes (titulo, descricao, prioridade, solicitante_id, area_id)
      VALUES (${titulo}, 'Descrição criada dentro da transação.', 'MEDIA',
              ${pessoas.solicitanteId}::uuid, ${pessoas.areaId}::uuid)`;
  }

  it('ADR-005: dentro de executarComUsuario, app.usuario_atual() e app.cargo_atual() devolvem o contexto', async () => {
    const lido = await contexto.executarComUsuario(
      { usuarioId: pessoas.analistaId, cargo: 'ANALISTA' },
      () => lerContexto(),
    );
    expect(lido).toEqual({ usuario: pessoas.analistaId, cargo: 'ANALISTA' });
  });

  it('ADR-005: logo depois, consultas sem contexto devolvem NULL, mesmo reaproveitando o pool', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await contexto.executarComUsuario({ usuarioId: pessoas.analistaId, cargo: 'ADMIN' }, () =>
        lerContexto(),
      );
    }

    const sequenciais: LinhaContexto[] = [];
    for (let consulta = 0; consulta < 20; consulta++) {
      sequenciais.push(await lerContexto());
    }
    const paralelas = await Promise.all(Array.from({ length: 10 }, () => lerContexto()));

    for (const linha of [...sequenciais, ...paralelas]) {
      expect(linha).toEqual({ usuario: null, cargo: null });
    }
  });

  it('ADR-005: executarComUsuario devolve o resultado de fn e grava o que ela fez', async () => {
    const titulo = `Transação confirmada ${randomUUID()}`;
    const resultado = await contexto.executarComUsuario(
      { usuarioId: pessoas.solicitanteId, cargo: 'SOLICITANTE' },
      async () => {
        await inserirSolicitacaoNoContexto(titulo);
        return 'concluído';
      },
    );
    expect(resultado).toBe('concluído');
    expect(await contarPorTitulo(titulo)).toBe(1);
  });

  it('ADR-005: se fn lança, nada é gravado (rollback) e o erro chega a quem chamou', async () => {
    const titulo = `Transação desfeita ${randomUUID()}`;
    await expect(
      contexto.executarComUsuario(
        { usuarioId: pessoas.solicitanteId, cargo: 'SOLICITANTE' },
        async () => {
          await inserirSolicitacaoNoContexto(titulo);
          throw new Error('falha proposital');
        },
      ),
    ).rejects.toThrow('falha proposital');

    expect(await contarPorTitulo(titulo)).toBe(0);
    expect(await lerContexto()).toEqual({ usuario: null, cargo: null });
  });
});
