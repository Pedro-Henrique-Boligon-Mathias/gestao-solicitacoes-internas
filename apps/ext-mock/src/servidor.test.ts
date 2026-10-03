import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import { criarServidor } from './servidor.ts';

type OpcoesServidor = Parameters<typeof criarServidor>[0];

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

let abertos: Server[] = [];

afterEach(async () => {
  for (const servidor of abertos) {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  }
  abertos = [];
});

/** Sobe o mock numa porta livre, sem log no console, e devolve a URL base. */
async function subir(opcoes: OpcoesServidor = {}): Promise<string> {
  const servidor = criarServidor({ log: () => undefined, ...opcoes });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  abertos.push(servidor);
  const { port } = servidor.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function evento(tipo = 'SolicitacaoAprovada') {
  return { id: crypto.randomUUID(), tipo, versao: 1, dados: {} };
}

function enviar(
  base: string,
  corpo: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${base}/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(corpo),
  });
}

async function listar(base: string): Promise<unknown[]> {
  const resposta = await fetch(`${base}/eventos`);
  assert.equal(resposta.status, 200);
  return (await resposta.json()) as unknown[];
}

describe('ext-mock: POST /eventos', () => {
  it('ADR-010: sem Idempotency-Key → 400 e nada é registrado', async () => {
    const base = await subir({ taxaDeFalha: 0 });

    const resposta = await enviar(base, evento(), { 'X-Correlation-Id': 'req-1' });

    assert.equal(resposta.status, 400);
    assert.deepEqual(await listar(base), []);
  });

  it('ADR-010: sem Idempotency-Key → 400 mesmo com taxa de falha 1 (a validação vem antes)', async () => {
    const base = await subir({ taxaDeFalha: 1 });

    assert.equal((await enviar(base, evento())).status, 400);
  });

  it('ADR-010: taxa de falha 1 → 503 e nada é registrado', async () => {
    const base = await subir({ taxaDeFalha: 1 });

    for (let i = 0; i < 5; i++) {
      const resposta = await enviar(base, evento(), { 'Idempotency-Key': crypto.randomUUID() });
      assert.equal(resposta.status, 503);
    }
    assert.deepEqual(await listar(base), []);
  });

  it('ADR-010: taxa de falha 0 → 201 { recebido: true } e o evento é registrado', async () => {
    const base = await subir({ taxaDeFalha: 0 });
    const chave = crypto.randomUUID();
    const antes = Date.now();

    const resposta = await enviar(base, evento('SolicitacaoReaberta'), {
      'Idempotency-Key': chave,
      'X-Correlation-Id': 'req-abc',
    });

    assert.equal(resposta.status, 201);
    assert.match(resposta.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await resposta.json(), { recebido: true });
    const lista = (await listar(base)) as { recebidoEm: string }[];
    assert.deepEqual(lista, [
      {
        idempotencyKey: chave,
        tipo: 'SolicitacaoReaberta',
        correlationId: 'req-abc',
        recebidoEm: lista[0]?.recebidoEm,
      },
    ]);
    assert.match(lista[0]!.recebidoEm, ISO_UTC);
    assert.ok(Date.parse(lista[0]!.recebidoEm) >= antes - 1000);
  });

  it('ADR-010: sem taxa informada, o padrão é 0 (nunca falha)', async () => {
    const base = await subir();

    for (let i = 0; i < 10; i++) {
      const resposta = await enviar(base, evento(), { 'Idempotency-Key': crypto.randomUUID() });
      assert.equal(resposta.status, 201);
    }
  });

  it('ADR-010: a falha simulada usa a taxa como probabilidade (sorteio abaixo da taxa → 503)', async () => {
    const sorteios = [0.49, 0.5, 0.51];
    const base = await subir({ taxaDeFalha: 0.5, aleatorio: () => sorteios.shift() ?? 0.99 });

    const status: number[] = [];
    for (let i = 0; i < 3; i++) {
      status.push(
        (await enviar(base, evento(), { 'Idempotency-Key': crypto.randomUUID() })).status,
      );
    }

    assert.deepEqual(status, [503, 201, 201]);
    assert.equal((await listar(base)).length, 2);
  });

  it('ADR-010: chave repetida → 200 { duplicado: true }, sem registrar de novo', async () => {
    const base = await subir({ taxaDeFalha: 0 });
    const chave = crypto.randomUUID();
    const corpo = evento();

    const primeira = await enviar(base, corpo, { 'Idempotency-Key': chave });
    const segunda = await enviar(base, corpo, { 'Idempotency-Key': chave });
    const terceira = await enviar(base, corpo, { 'Idempotency-Key': chave });

    assert.equal(primeira.status, 201);
    assert.equal(segunda.status, 200);
    assert.deepEqual(await segunda.json(), { duplicado: true });
    assert.equal(terceira.status, 200);
    const lista = (await listar(base)) as { idempotencyKey: string }[];
    assert.equal(lista.length, 1);
    assert.equal(lista[0]!.idempotencyKey, chave);
  });

  it('ADR-010: uma chave que recebeu 503 é registrada quando o reenvio dá certo', async () => {
    const sorteios = [0, 0.99];
    const base = await subir({ taxaDeFalha: 0.5, aleatorio: () => sorteios.shift() ?? 0.99 });
    const chave = crypto.randomUUID();

    assert.equal((await enviar(base, evento(), { 'Idempotency-Key': chave })).status, 503);
    assert.equal((await enviar(base, evento(), { 'Idempotency-Key': chave })).status, 201);

    assert.equal((await listar(base)).length, 1);
  });

  it('ADR-010: loga cada requisição com a chave, o tipo, o correlation id e o status', async () => {
    const registros: Record<string, unknown>[] = [];
    const base = await subir({ taxaDeFalha: 0, log: (registro) => registros.push(registro) });
    const chave = crypto.randomUUID();

    await enviar(base, evento(), { 'Idempotency-Key': chave, 'X-Correlation-Id': 'req-log' });
    await enviar(base, evento(), { 'Idempotency-Key': chave, 'X-Correlation-Id': 'req-log' });

    const doEvento = registros.filter((registro) => registro.idempotencyKey === chave);
    assert.equal(doEvento.length, 2);
    assert.deepEqual(
      doEvento.map(({ tipo, correlationId, status }) => ({ tipo, correlationId, status })),
      [
        { tipo: 'SolicitacaoAprovada', correlationId: 'req-log', status: 201 },
        { tipo: 'SolicitacaoAprovada', correlationId: 'req-log', status: 200 },
      ],
    );
  });
});

describe('ext-mock: GET /eventos e GET /health', () => {
  it('ADR-010: GET /eventos lista do mais antigo para o mais recente', async () => {
    const base = await subir({ taxaDeFalha: 0 });
    const chaves = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const chave of chaves) {
      await enviar(base, evento(), {
        'Idempotency-Key': chave,
        'X-Correlation-Id': `req-${chave}`,
      });
    }

    const lista = (await listar(base)) as { idempotencyKey: string; correlationId: string }[];

    assert.deepEqual(
      lista.map((item) => item.idempotencyKey),
      chaves,
    );
    assert.deepEqual(
      lista.map((item) => item.correlationId),
      chaves.map((chave) => `req-${chave}`),
    );
  });

  it('GET /health → 200', async () => {
    const base = await subir({ taxaDeFalha: 1 });

    const resposta = await fetch(`${base}/health`);

    assert.equal(resposta.status, 200);
  });
});
