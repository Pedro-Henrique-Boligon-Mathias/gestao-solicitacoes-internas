import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** Evento aceito, como aparece em GET /eventos. */
export interface EventoRecebido {
  idempotencyKey: string;
  tipo: string | null;
  correlationId: string | null;
  recebidoEm: string;
}

// `type`, e não `interface`, para caber em Record<string, unknown> (log genérico)
export type RegistroDeLog = {
  idempotencyKey: string | null;
  tipo: string | null;
  correlationId: string | null;
  status: number;
  resultado: 'RECEBIDO' | 'DUPLICADO' | 'FALHA_SIMULADA' | 'SEM_IDEMPOTENCY_KEY' | 'CORPO_INVALIDO';
};

export interface OpcoesServidor {
  /** Probabilidade (0 a 1) de responder 503 a um POST /eventos válido. Padrão: 0. */
  taxaDeFalha?: number;
  /** Sorteio em [0, 1); a falha acontece quando ele fica abaixo da taxa. Padrão: Math.random. */
  aleatorio?: () => number;
  /** Destino de cada linha de log. Padrão: JSON no stdout. */
  log?: (registro: RegistroDeLog) => void;
}

const LIMITE_CORPO = 1_048_576;

function logPadrao(registro: RegistroDeLog): void {
  process.stdout.write(`${JSON.stringify({ hora: new Date().toISOString(), ...registro })}\n`);
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

function header(req: IncomingMessage, nome: string): string | null {
  const valor = req.headers[nome];
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto && texto.trim() !== '' ? texto.trim() : null;
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let tamanho = 0;
    req.on('data', (parte: Buffer) => {
      tamanho += parte.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new Error('Corpo grande demais.'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function tipoDoCorpo(texto: string): string | null | undefined {
  try {
    const corpo: unknown = JSON.parse(texto);
    if (!corpo || typeof corpo !== 'object') return undefined;
    const { tipo } = corpo as { tipo?: unknown };
    return typeof tipo === 'string' ? tipo : null;
  } catch {
    return undefined;
  }
}

/**
 * Simulador do sistema corporativo que recebe os eventos (ADR-010). Guarda em memória o que
 * recebeu e ignora reenvios da mesma Idempotency-Key, como um receptor at-least-once deve fazer.
 * Devolve o servidor sem chamar `listen`.
 */
export function criarServidor(opcoes: OpcoesServidor = {}): Server {
  const taxaDeFalha = opcoes.taxaDeFalha ?? 0;
  const aleatorio = opcoes.aleatorio ?? Math.random;
  const log = opcoes.log ?? logPadrao;
  const recebidos: EventoRecebido[] = [];
  const chaves = new Set<string>();

  async function receberEvento(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const texto = await lerCorpo(req);
    const idempotencyKey = header(req, 'idempotency-key');
    const correlationId = header(req, 'x-correlation-id');
    const tipo = tipoDoCorpo(texto);
    const registrar = (status: number, resultado: RegistroDeLog['resultado']) =>
      log({ idempotencyKey, tipo: tipo ?? null, correlationId, status, resultado });

    if (!idempotencyKey) {
      registrar(400, 'SEM_IDEMPOTENCY_KEY');
      responder(res, 400, { erro: 'O header Idempotency-Key é obrigatório.' });
      return;
    }
    if (tipo === undefined) {
      registrar(400, 'CORPO_INVALIDO');
      responder(res, 400, { erro: 'O corpo deve ser um objeto JSON.' });
      return;
    }
    if (aleatorio() < taxaDeFalha) {
      registrar(503, 'FALHA_SIMULADA');
      responder(res, 503, { erro: 'Indisponibilidade simulada (MOCK_FAILURE_RATE).' });
      return;
    }
    if (chaves.has(idempotencyKey)) {
      registrar(200, 'DUPLICADO');
      responder(res, 200, { duplicado: true });
      return;
    }
    chaves.add(idempotencyKey);
    recebidos.push({ idempotencyKey, tipo, correlationId, recebidoEm: new Date().toISOString() });
    registrar(201, 'RECEBIDO');
    responder(res, 201, { recebido: true });
  }

  return createServer((req, res) => {
    const caminho = (req.url ?? '/').split('?')[0];
    if (caminho === '/health' && req.method === 'GET') {
      responder(res, 200, { status: 'ok' });
    } else if (caminho === '/eventos' && req.method === 'GET') {
      responder(res, 200, recebidos);
    } else if (caminho === '/eventos' && req.method === 'POST') {
      receberEvento(req, res).catch((erro: unknown) => {
        if (!res.headersSent) responder(res, 413, { erro: String(erro) });
      });
    } else {
      responder(res, 404, { erro: 'Rota não encontrada.' });
    }
  });
}
