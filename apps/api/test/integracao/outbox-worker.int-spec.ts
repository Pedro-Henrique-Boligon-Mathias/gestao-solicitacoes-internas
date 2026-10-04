import { readFileSync, rmSync, statSync } from 'node:fs';
import type { Client } from 'pg';
import {
  conectar,
  criarBancoMigrado,
  criarPessoas,
  decisaoCompleta,
  inserirSolicitacao,
  type Pessoas,
} from './banco';
import {
  ambienteDoWorker,
  criarServidorFalso,
  eventoPorId,
  inserirEvento,
  subirWorker,
  type ServidorFalso,
  type WorkerDeTeste,
} from './outbox';

const SEGUNDO = 1_000;

/*
 * Worker da outbox contra um Postgres real (conectado como app_worker) e um servidor HTTP falso
 * no lugar do sistema externo. Os eventos são inseridos direto na outbox (app_owner); cada teste
 * roda os ciclos que precisa chamando processarCiclo(). Configuração do arquivo: lote 10, timeout
 * de 1 s, backoff base de 60 s (a próxima tentativa sempre cai no futuro) e 3 tentativas.
 */
describe('ADR-010: worker da outbox', () => {
  let owner: Client;
  let pessoas: Pessoas;
  let servidor: ServidorFalso;
  let ambiente: Record<string, string>;
  let worker: WorkerDeTeste;

  beforeAll(async () => {
    const banco = `worker_${crypto.randomUUID().replaceAll('-', '')}`;
    await criarBancoMigrado(banco);
    owner = await conectar('owner', banco);
    pessoas = await criarPessoas(owner);
    servidor = await criarServidorFalso();
    ambiente = ambienteDoWorker(banco, servidor.url);
    worker = await subirWorker(ambiente);
  });

  afterEach(async () => {
    // Cada teste começa com a outbox vazia e o servidor respondendo 201
    await owner.query('DELETE FROM outbox_eventos');
    servidor.limpar();
  });

  afterAll(async () => {
    await worker?.fechar();
    await servidor?.fechar();
    await owner?.end();
    if (ambiente) rmSync(ambiente.WORKER_HEARTBEAT_ARQUIVO!, { force: true });
  });

  const ciclo = () => worker.processador.processarCiclo();
  /** Solicitação APROVADA coerente com as CHECKs (analista definido e decisão completa). */
  const novaSolicitacao = () =>
    inserirSolicitacao(owner, pessoas, {
      status: 'APROVADA',
      analista_id: pessoas.analistaId,
      ...decisaoCompleta(pessoas.analistaId),
    });

  /** Libera um evento agendado para o futuro (simula o tempo do backoff passando). */
  async function liberar(id: string): Promise<void> {
    await owner.query(
      "UPDATE outbox_eventos SET proxima_tentativa_em = now() - interval '1 second' WHERE id = $1",
      [id],
    );
  }

  /** Eventos em ordem de criação conhecida: `criado_em` espaçado de 1 s a partir de `base`. */
  function instante(base: number, deslocamento: number): Date {
    return new Date(base + deslocamento * SEGUNDO);
  }

  describe('envio e resultado de cada tentativa', () => {
    it('ADR-010: 2xx → POST /eventos com o payload, Idempotency-Key e X-Correlation-Id; marca ENVIADO', async () => {
      const solicitacao = await novaSolicitacao();
      const id = await inserirEvento(owner, solicitacao, { correlation_id: 'req-envio-201' });
      const linha = await eventoPorId(owner, id);

      const antes = Date.now();
      await ciclo();
      const depois = Date.now();

      const recebidas = servidor.doEvento(id);
      expect(recebidas).toHaveLength(1);
      expect(recebidas[0]).toMatchObject({
        metodo: 'POST',
        caminho: '/eventos',
        corpo: linha.payload,
      });
      expect(recebidas[0]!.headers).toMatchObject({
        'idempotency-key': id,
        'x-correlation-id': 'req-envio-201',
      });
      expect(recebidas[0]!.headers['content-type']).toContain('application/json');

      const enviado = await eventoPorId(owner, id);
      expect(enviado).toMatchObject({ status: 'ENVIADO', tentativas: 1 });
      expect(enviado.enviado_em).not.toBeNull();
      expect(enviado.enviado_em!.getTime()).toBeGreaterThanOrEqual(antes - SEGUNDO);
      expect(enviado.enviado_em!.getTime()).toBeLessThanOrEqual(depois + SEGUNDO);
    });

    it('ADR-010: um evento ENVIADO não é enviado de novo nos ciclos seguintes', async () => {
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      await ciclo();
      await ciclo();

      expect(servidor.doEvento(id)).toHaveLength(1);
    });

    it('ADR-010: 503 → continua PENDENTE com tentativas 1, ultimo_erro e próxima tentativa no futuro (backoff)', async () => {
      servidor.responder = () => ({ status: 503 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      const antes = Date.now();
      await ciclo();

      expect(servidor.doEvento(id)).toHaveLength(1);
      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'PENDENTE', tentativas: 1, enviado_em: null });
      expect(linha.ultimo_erro).toEqual(expect.stringContaining('503'));
      // base 60 s com jitter de ±20%: entre 48 s e 72 s a partir de agora
      const atraso = linha.proxima_tentativa_em.getTime() - antes;
      expect(atraso).toBeGreaterThanOrEqual(45 * SEGUNDO);
      expect(atraso).toBeLessThanOrEqual(75 * SEGUNDO);
    });

    it('ADR-010: um evento agendado para o futuro não é tentado antes da hora', async () => {
      servidor.responder = () => ({ status: 503 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      await ciclo();

      expect(servidor.doEvento(id)).toHaveLength(1);
      expect(await eventoPorId(owner, id)).toMatchObject({ status: 'PENDENTE', tentativas: 1 });
    });

    it('ADR-010: a segunda falha dobra o atraso (base × 2)', async () => {
      servidor.responder = () => ({ status: 503 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      await liberar(id);
      const antes = Date.now();
      await ciclo();

      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'PENDENTE', tentativas: 2 });
      // 120 s com jitter de ±20%: entre 96 s e 144 s
      const atraso = linha.proxima_tentativa_em.getTime() - antes;
      expect(atraso).toBeGreaterThanOrEqual(90 * SEGUNDO);
      expect(atraso).toBeLessThanOrEqual(150 * SEGUNDO);
    });

    it.each([408, 429, 500])(
      'ADR-010: HTTP %i também é transitório (nova tentativa agendada)',
      async (status) => {
        servidor.responder = () => ({ status });
        const id = await inserirEvento(owner, await novaSolicitacao());

        await ciclo();

        expect(await eventoPorId(owner, id)).toMatchObject({ status: 'PENDENTE', tentativas: 1 });
      },
    );

    it('ADR-010: tempo esgotado (OUTBOX_TIMEOUT_MS) é transitório', async () => {
      servidor.responder = () => ({ status: 201, atrasoMs: 5 * SEGUNDO });
      const id = await inserirEvento(owner, await novaSolicitacao());

      const antes = Date.now();
      await ciclo();

      // O ciclo não espera os 5 s do servidor: desiste no timeout de 1 s
      expect(Date.now() - antes).toBeLessThan(4 * SEGUNDO);
      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'PENDENTE', tentativas: 1, enviado_em: null });
      expect(linha.ultimo_erro).not.toBeNull();
      expect(linha.proxima_tentativa_em.getTime()).toBeGreaterThan(Date.now());
    });

    it('ADR-010: 400 → FALHOU direto (erro permanente), sem novas tentativas', async () => {
      servidor.responder = () => ({ status: 400, corpo: { erro: 'Idempotency-Key ausente' } });
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      await liberar(id);
      await ciclo();

      expect(servidor.doEvento(id)).toHaveLength(1);
      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'FALHOU', tentativas: 1, enviado_em: null });
      expect(linha.ultimo_erro).toEqual(expect.stringContaining('400'));
    });

    it('ADR-010: tentativas esgotadas (OUTBOX_MAX_TENTATIVAS = 3) → FALHOU', async () => {
      servidor.responder = () => ({ status: 503 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      expect(await eventoPorId(owner, id)).toMatchObject({ status: 'PENDENTE', tentativas: 1 });
      await liberar(id);
      await ciclo();
      expect(await eventoPorId(owner, id)).toMatchObject({ status: 'PENDENTE', tentativas: 2 });
      await liberar(id);
      await ciclo();

      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'FALHOU', tentativas: 3, enviado_em: null });
      expect(linha.ultimo_erro).toEqual(expect.stringContaining('503'));

      await liberar(id);
      await ciclo();
      // Sempre a mesma chave de idempotência, e nada depois de FALHOU
      const recebidas = servidor.doEvento(id);
      expect(recebidas).toHaveLength(3);
      expect(new Set(recebidas.map((r) => r.headers['idempotency-key']))).toEqual(new Set([id]));
    });

    it('ADR-010: depois de falhas transitórias, um 201 marca ENVIADO', async () => {
      let chamadas = 0;
      servidor.responder = () => ({ status: ++chamadas === 1 ? 503 : 201 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      await ciclo();
      await liberar(id);
      await ciclo();

      const linha = await eventoPorId(owner, id);
      expect(linha).toMatchObject({ status: 'ENVIADO', tentativas: 2 });
      expect(linha.enviado_em).not.toBeNull();
    });

    it('ADR-010: o lote respeita OUTBOX_LOTE (10 por ciclo)', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 12; i++) ids.push(await inserirEvento(owner, await novaSolicitacao()));

      await ciclo();
      expect(servidor.doEvento(...ids)).toHaveLength(10);

      await ciclo();
      expect(servidor.doEvento(...ids)).toHaveLength(12);
    });
  });

  describe('RN-14: ultima_tentativa_em (PR 4C)', () => {
    /** Roda um ciclo e devolve a ultima_tentativa_em do evento e a janela do ciclo. */
    async function cicloMedido(id: string) {
      const antes = Date.now();
      await ciclo();
      const depois = Date.now();
      const linha = await eventoPorId(owner, id);
      return { linha, antes, depois };
    }

    function esperarNaJanela(valor: Date | null | undefined, antes: number, depois: number) {
      expect(valor).toBeInstanceOf(Date);
      expect(valor!.getTime()).toBeGreaterThanOrEqual(antes - SEGUNDO);
      expect(valor!.getTime()).toBeLessThanOrEqual(depois + SEGUNDO);
    }

    it('RN-14: evento novo, ainda sem tentativa → ultima_tentativa_em null', async () => {
      const id = await inserirEvento(owner, await novaSolicitacao());
      const linha = await eventoPorId(owner, id);
      expect(linha).toHaveProperty('ultima_tentativa_em', null);
    });

    it('RN-14: worker grava ultima_tentativa_em a cada tentativa — sucesso (2xx)', async () => {
      const id = await inserirEvento(owner, await novaSolicitacao());
      const { linha, antes, depois } = await cicloMedido(id);
      expect(linha.status).toBe('ENVIADO');
      esperarNaJanela(linha.ultima_tentativa_em, antes, depois);
    });

    it('RN-14: worker grava ultima_tentativa_em a cada tentativa — falha transitória (503)', async () => {
      servidor.responder = () => ({ status: 503 });
      const id = await inserirEvento(owner, await novaSolicitacao());

      const primeira = await cicloMedido(id);
      expect(primeira.linha).toMatchObject({ status: 'PENDENTE', tentativas: 1 });
      esperarNaJanela(primeira.linha.ultima_tentativa_em, primeira.antes, primeira.depois);

      await new Promise((resolver) => setTimeout(resolver, 50));
      await liberar(id);
      const segunda = await cicloMedido(id);
      expect(segunda.linha).toMatchObject({ status: 'PENDENTE', tentativas: 2 });
      esperarNaJanela(segunda.linha.ultima_tentativa_em, segunda.antes, segunda.depois);
      // A segunda tentativa sobrescreve o horário da primeira
      expect(segunda.linha.ultima_tentativa_em!.getTime()).toBeGreaterThan(
        primeira.linha.ultima_tentativa_em!.getTime(),
      );
    });

    it('RN-14: worker grava ultima_tentativa_em a cada tentativa — erro permanente (400 → FALHOU)', async () => {
      servidor.responder = () => ({ status: 400 });
      const id = await inserirEvento(owner, await novaSolicitacao());
      const { linha, antes, depois } = await cicloMedido(id);
      expect(linha.status).toBe('FALHOU');
      esperarNaJanela(linha.ultima_tentativa_em, antes, depois);
    });

    it('RN-14: worker grava ultima_tentativa_em a cada tentativa — tempo esgotado', async () => {
      servidor.responder = () => ({ status: 201, atrasoMs: 5 * SEGUNDO });
      const id = await inserirEvento(owner, await novaSolicitacao());
      const { linha, antes, depois } = await cicloMedido(id);
      expect(linha).toMatchObject({ status: 'PENDENTE', tentativas: 1 });
      esperarNaJanela(linha.ultima_tentativa_em, antes, depois);
    });

    it('RN-14: evento agendado para o futuro não é tentado → ultima_tentativa_em continua null', async () => {
      const id = await inserirEvento(owner, await novaSolicitacao(), {
        proxima_tentativa_em: new Date(Date.now() + 60 * SEGUNDO),
      });
      const { linha } = await cicloMedido(id);
      expect(linha).toMatchObject({ tentativas: 0, ultima_tentativa_em: null });
    });
  });

  describe('ordem por solicitação', () => {
    it('ADR-010: com o SolicitacaoAprovada aguardando nova tentativa, o SolicitacaoReaberta da mesma solicitação não sai', async () => {
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      const aprovada = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
        tentativas: 1,
        proxima_tentativa_em: new Date(Date.now() + 10 * 60 * SEGUNDO),
      });
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });

      await ciclo();

      expect(servidor.doEvento(aprovada, reaberta)).toHaveLength(0);
      expect(await eventoPorId(owner, reaberta)).toMatchObject({
        status: 'PENDENTE',
        tentativas: 0,
      });
    });

    it('ADR-010: com o SolicitacaoAprovada em FALHOU, o SolicitacaoReaberta fica retido', async () => {
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
        status: 'FALHOU',
        tentativas: 3,
        ultimo_erro: 'HTTP 503',
      });
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });

      await ciclo();

      expect(servidor.doEvento(reaberta)).toHaveLength(0);
      expect(await eventoPorId(owner, reaberta)).toMatchObject({
        status: 'PENDENTE',
        tentativas: 0,
      });
    });

    it('ADR-010: depois que o primeiro é ENVIADO, o segundo sai, nessa ordem', async () => {
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      const aprovada = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
        tentativas: 1,
        proxima_tentativa_em: new Date(Date.now() + 10 * 60 * SEGUNDO),
      });
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });
      await ciclo();
      expect(servidor.doEvento(aprovada, reaberta)).toHaveLength(0);

      await liberar(aprovada);
      await ciclo();
      await ciclo();

      const recebidas = servidor.doEvento(aprovada, reaberta);
      expect(recebidas.map((r) => r.headers['idempotency-key'])).toEqual([aprovada, reaberta]);
      expect(await eventoPorId(owner, aprovada)).toMatchObject({ status: 'ENVIADO' });
      expect(await eventoPorId(owner, reaberta)).toMatchObject({ status: 'ENVIADO' });
    });

    it('ADR-010: dois eventos pendentes da mesma solicitação saem do mais antigo para o mais recente', async () => {
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      // Inseridos fora de ordem: a ordem vem de criado_em, não da inserção
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });
      const aprovada = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
      });

      await ciclo();
      await ciclo();

      expect(
        servidor.doEvento(aprovada, reaberta).map((r) => r.headers['idempotency-key']),
      ).toEqual([aprovada, reaberta]);
    });

    it('ADR-010: se o primeiro falha de forma transitória, o segundo não passa na frente', async () => {
      servidor.responder = (requisicao) => ({
        status: (requisicao.corpo as { tipo?: string }).tipo === 'SolicitacaoAprovada' ? 503 : 201,
      });
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      const aprovada = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
      });
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });

      await ciclo();
      await ciclo();

      expect(servidor.doEvento(reaberta)).toHaveLength(0);
      expect(await eventoPorId(owner, aprovada)).toMatchObject({
        status: 'PENDENTE',
        tentativas: 1,
      });
      expect(await eventoPorId(owner, reaberta)).toMatchObject({
        status: 'PENDENTE',
        tentativas: 0,
      });
    });

    it('ADR-010: eventos de solicitações diferentes não se bloqueiam', async () => {
      const base = Date.now() - 60 * SEGUNDO;
      const travada = await novaSolicitacao();
      await inserirEvento(owner, travada, {
        criado_em: instante(base, 0),
        status: 'FALHOU',
        tentativas: 3,
        ultimo_erro: 'HTTP 503',
      });
      const aguardando = await novaSolicitacao();
      await inserirEvento(owner, aguardando, {
        criado_em: instante(base, 1),
        tentativas: 1,
        proxima_tentativa_em: new Date(Date.now() + 10 * 60 * SEGUNDO),
      });
      const livre = await novaSolicitacao();
      const id = await inserirEvento(owner, livre, { criado_em: instante(base, 2) });

      await ciclo();

      expect(servidor.doEvento(id)).toHaveLength(1);
      expect(await eventoPorId(owner, id)).toMatchObject({ status: 'ENVIADO' });
    });
  });

  describe('concorrência e heartbeat', () => {
    it('ADR-010: dois workers em paralelo não enviam o mesmo evento (FOR UPDATE SKIP LOCKED)', async () => {
      // Resposta lenta para os dois ciclos se sobreporem de verdade
      servidor.responder = () => ({ status: 201, atrasoMs: 50 });
      const ids: string[] = [];
      for (let i = 0; i < 16; i++) ids.push(await inserirEvento(owner, await novaSolicitacao()));

      const outro = await subirWorker(ambiente);
      try {
        for (let rodada = 0; rodada < 4; rodada++) {
          await Promise.all([ciclo(), outro.processador.processarCiclo()]);
        }
      } finally {
        await outro.fechar();
      }

      const recebidas = servidor.doEvento(...ids);
      const chaves = recebidas.map((r) => String(r.headers['idempotency-key']));
      expect(chaves).toHaveLength(ids.length);
      expect(new Set(chaves)).toEqual(new Set(ids));
      const status = await owner.query<{ status: string; total: number }>(
        'SELECT status::text AS status, count(*)::int AS total FROM outbox_eventos GROUP BY status',
      );
      expect(status.rows).toEqual([{ status: 'ENVIADO', total: ids.length }]);
    });

    it('ADR-010: com dois workers, o 2º evento da mesma solicitação espera o 1º terminar', async () => {
      const solicitacao = await novaSolicitacao();
      const base = Date.now() - 60 * SEGUNDO;
      const aprovada = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoAprovada',
        criado_em: instante(base, 0),
      });
      const reaberta = await inserirEvento(owner, solicitacao, {
        tipo: 'SolicitacaoReaberta',
        criado_em: instante(base, 1),
      });
      // O 1º evento fica travado (em envio) por 300 ms; o outro worker não pode pular para o 2º
      const atrasoMs = 300;
      servidor.responder = (requisicao) =>
        requisicao.headers['idempotency-key'] === aprovada
          ? { status: 201, atrasoMs }
          : { status: 201 };

      const outro = await subirWorker(ambiente);
      try {
        await Promise.all([ciclo(), outro.processador.processarCiclo()]);
      } finally {
        await outro.fechar();
      }

      const recebidas = servidor.doEvento(aprovada, reaberta);
      expect(recebidas.map((r) => r.headers['idempotency-key'])).toEqual([aprovada, reaberta]);
      expect(recebidas[1]!.recebidaEm - recebidas[0]!.recebidaEm).toBeGreaterThanOrEqual(
        atrasoMs - 20,
      );
      expect(await eventoPorId(owner, reaberta)).toMatchObject({ status: 'ENVIADO' });
    });

    it('ADR-010: cada ciclo grava o horário no arquivo de heartbeat, mesmo sem eventos', async () => {
      const arquivo = ambiente.WORKER_HEARTBEAT_ARQUIVO!;
      rmSync(arquivo, { force: true });

      const antes = Date.now();
      await ciclo();
      const primeiro = readFileSync(arquivo, 'utf8').trim();
      const primeiroEm = Date.parse(primeiro);
      expect(primeiro).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      expect(primeiroEm).toBeGreaterThanOrEqual(antes - SEGUNDO);
      expect(primeiroEm).toBeLessThanOrEqual(Date.now() + SEGUNDO);

      await new Promise((resolve) => setTimeout(resolve, 20));
      await ciclo();
      const segundoEm = Date.parse(readFileSync(arquivo, 'utf8').trim());
      expect(segundoEm).toBeGreaterThan(primeiroEm);
      expect(statSync(arquivo).mtimeMs).toBeGreaterThanOrEqual(antes - SEGUNDO);
    });

    it('ADR-010: o heartbeat também é atualizado num ciclo com eventos', async () => {
      const arquivo = ambiente.WORKER_HEARTBEAT_ARQUIVO!;
      rmSync(arquivo, { force: true });
      await inserirEvento(owner, await novaSolicitacao());

      const antes = Date.now();
      await ciclo();

      expect(Date.parse(readFileSync(arquivo, 'utf8').trim())).toBeGreaterThanOrEqual(
        antes - SEGUNDO,
      );
    });
  });
});
