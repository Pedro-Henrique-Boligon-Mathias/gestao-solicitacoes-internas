import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Client } from 'pg';
import { urlBanco } from './ambiente';

export type StatusOutbox = 'PENDENTE' | 'ENVIADO' | 'FALHOU';
export type TipoEvento = 'SolicitacaoAprovada' | 'SolicitacaoReaberta';

/** Linha de outbox_eventos lida como app_owner (ignora RLS e permissões de coluna). */
export interface LinhaOutbox {
  id: string;
  tipo: TipoEvento;
  agregado_id: string;
  payload: Record<string, unknown>;
  status: StatusOutbox;
  tentativas: number;
  proxima_tentativa_em: Date;
  ultimo_erro: string | null;
  correlation_id: string | null;
  criado_em: Date;
  enviado_em: Date | null;
}

/** Eventos da solicitação, do mais antigo para o mais recente. */
export async function eventosDaSolicitacao(
  owner: Client,
  agregadoId: string,
): Promise<LinhaOutbox[]> {
  const resultado = await owner.query<LinhaOutbox>(
    'SELECT * FROM outbox_eventos WHERE agregado_id = $1 ORDER BY criado_em, id',
    [agregadoId],
  );
  return resultado.rows;
}

export async function eventoPorId(owner: Client, id: string): Promise<LinhaOutbox> {
  const resultado = await owner.query<LinhaOutbox>('SELECT * FROM outbox_eventos WHERE id = $1', [
    id,
  ]);
  if (resultado.rowCount !== 1) throw new Error(`Evento ${id} não encontrado na outbox.`);
  return resultado.rows[0]!;
}

export type CamposEvento = Partial<{
  tipo: TipoEvento;
  payload: Record<string, unknown>;
  status: StatusOutbox;
  tentativas: number;
  proxima_tentativa_em: Date;
  ultimo_erro: string | null;
  correlation_id: string | null;
  criado_em: Date;
  enviado_em: Date | null;
}>;

/**
 * Insere um evento direto na outbox como app_owner, com valores válidos por padrão. O `id` é
 * gerado aqui para o payload poder citá-lo (no contrato, `payload.id` é o id do evento).
 */
export async function inserirEvento(
  owner: Client,
  agregadoId: string,
  campos: CamposEvento = {},
): Promise<string> {
  const id = randomUUID();
  const tipo = campos.tipo ?? 'SolicitacaoAprovada';
  const correlationId =
    campos.correlation_id === undefined ? `req-${id.slice(0, 8)}` : campos.correlation_id;
  const valores: Record<string, unknown> = {
    id,
    tipo,
    agregado_id: agregadoId,
    payload: JSON.stringify(
      campos.payload ?? {
        id,
        tipo,
        versao: 1,
        ocorridoEm: new Date().toISOString(),
        correlationId,
        dados: { solicitacao: { id: agregadoId } },
      },
    ),
    correlation_id: correlationId,
  };
  for (const campo of [
    'status',
    'tentativas',
    'proxima_tentativa_em',
    'ultimo_erro',
    'criado_em',
    'enviado_em',
  ] as const) {
    if (campos[campo] !== undefined) valores[campo] = campos[campo];
  }
  const colunas = Object.keys(valores);
  const parametros = colunas.map((coluna, indice) =>
    coluna === 'payload' ? `$${indice + 1}::jsonb` : `$${indice + 1}`,
  );
  await owner.query(
    `INSERT INTO outbox_eventos (${colunas.join(', ')}) VALUES (${parametros.join(', ')})`,
    Object.values(valores),
  );
  return id;
}

export interface RequisicaoRecebida {
  metodo: string;
  caminho: string;
  headers: IncomingHttpHeaders;
  corpo: unknown;
  recebidaEm: number;
}

export interface Resposta {
  status: number;
  /** Segura a resposta por esse tempo (para simular lentidão ou tempo esgotado). */
  atrasoMs?: number;
  corpo?: unknown;
}

/**
 * Servidor HTTP falso no lugar do sistema externo. Registra cada requisição e responde conforme
 * `responder`, que o teste troca quando quiser (padrão: 201).
 */
export interface ServidorFalso {
  url: string;
  requisicoes: RequisicaoRecebida[];
  responder: (requisicao: RequisicaoRecebida) => Resposta;
  /** Requisições cujo Idempotency-Key é um dos ids informados (ignora eventos de outros testes). */
  doEvento: (...ids: string[]) => RequisicaoRecebida[];
  limpar: () => void;
  fechar: () => Promise<void>;
}

export async function criarServidorFalso(): Promise<ServidorFalso> {
  const pendentes = new Set<NodeJS.Timeout>();
  const estado: Omit<ServidorFalso, 'url' | 'fechar' | 'doEvento' | 'limpar'> = {
    requisicoes: [],
    responder: () => ({ status: 201, corpo: { recebido: true } }),
  };

  const servidor: Server = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      let corpo: unknown = texto;
      try {
        corpo = texto ? JSON.parse(texto) : null;
      } catch {
        // corpo fica como texto
      }
      const requisicao: RequisicaoRecebida = {
        metodo: req.method ?? '',
        caminho: req.url ?? '',
        headers: req.headers,
        corpo,
        recebidaEm: Date.now(),
      };
      estado.requisicoes.push(requisicao);
      const resposta = estado.responder(requisicao);
      const enviar = () => {
        if (res.destroyed) return;
        res.writeHead(resposta.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resposta.corpo ?? {}));
      };
      if (resposta.atrasoMs) {
        const timer = setTimeout(() => {
          pendentes.delete(timer);
          enviar();
        }, resposta.atrasoMs);
        pendentes.add(timer);
      } else {
        enviar();
      }
    });
  });

  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address() as AddressInfo;

  const falso = estado as ServidorFalso;
  falso.url = `http://127.0.0.1:${port}`;
  falso.doEvento = (...ids) =>
    estado.requisicoes.filter((r) => ids.includes(String(r.headers['idempotency-key'])));
  falso.limpar = () => {
    estado.requisicoes.length = 0;
    estado.responder = () => ({ status: 201, corpo: { recebido: true } });
  };
  falso.fechar = async () => {
    for (const timer of pendentes) clearTimeout(timer);
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  };
  return falso;
}

/** Contrato do worker usado nos testes: um ciclo por chamada, sem o laço de intervalo. */
export interface Processador {
  processarCiclo(): Promise<unknown>;
}

export interface WorkerDeTeste {
  processador: Processador;
  fechar: () => Promise<void>;
}

/** Arquivo de heartbeat próprio do teste, numa pasta temporária. */
export function arquivoHeartbeat(): string {
  return path.join(os.tmpdir(), `worker-heartbeat-${randomUUID()}`);
}

/**
 * Variáveis do worker para o banco informado (conecta como app_worker). Precisam estar no
 * process.env antes do primeiro import do WorkerModule, porque o ConfigModule valida o ambiente
 * ao carregar o módulo: por isso cada arquivo de teste usa uma única configuração.
 */
export function ambienteDoWorker(
  banco: string,
  extUrl: string,
  variaveis: Record<string, string> = {},
): Record<string, string> {
  return {
    WORKER_DATABASE_URL: urlBanco('worker', banco),
    EXT_URL: extUrl,
    OUTBOX_INTERVALO_MS: '60000',
    OUTBOX_LOTE: '10',
    OUTBOX_TIMEOUT_MS: '1000',
    OUTBOX_BACKOFF_BASE_MS: '60000',
    OUTBOX_BACKOFF_MAX_MS: '600000',
    OUTBOX_MAX_TENTATIVAS: '3',
    WORKER_HEARTBEAT_ARQUIVO: arquivoHeartbeat(),
    ...variaveis,
  };
}

/**
 * Sobe o contexto do worker (WorkerModule, sem HTTP) e devolve o ProcessadorOutbox. O `init()`
 * não pode iniciar o laço por intervalo: os ciclos rodam só quando o teste chama processarCiclo().
 * Cada chamada cria uma instância nova (com o próprio pool de conexões), como uma réplica.
 */
export async function subirWorker(variaveis: Record<string, string>): Promise<WorkerDeTeste> {
  Object.assign(process.env, variaveis);

  const { Test } = await import('@nestjs/testing');
  const { WorkerModule } = await import('../../src/worker.module.js');
  const { ProcessadorOutbox } =
    await import('../../src/modules/integracoes/application/processador-outbox.js');

  const modulo = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
  await modulo.init();
  const processador = modulo.get<Processador>(ProcessadorOutbox);
  return { processador, fechar: () => modulo.close() };
}
