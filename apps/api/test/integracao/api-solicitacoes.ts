import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SENHA_SEED, criarUsuarioComSenha } from './api-http';

export const BASE = '/api/v1';
export const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
export const DIA = 24 * 60 * 60 * 1000;

/** Usuários do seed (nota de usuários e permissões). */
export const EMAILS_SEED = {
  ana: 'ana.souza@demo.test',
  bruno: 'bruno.lima@demo.test',
  camila: 'camila.rocha@demo.test',
  carla: 'carla.mendes@demo.test',
  rafael: 'rafael.costa@demo.test',
  diego: 'diego.alves@demo.test',
} as const;

export type Apelido = keyof typeof EMAILS_SEED;

export type Acao =
  'EDITAR' | 'EXCLUIR' | 'INICIAR_ANALISE' | 'DECIDIR' | 'REABRIR' | 'REPROCESSAR_INTEGRACAO';
export type Status = 'ABERTA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA';
export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA';

export interface Sessao {
  token: string;
  id: string;
  nome: string;
  cargo: string;
  area: { id: string; nome: string };
}

export interface Pessoa {
  id: string;
  nome: string;
}

export interface ItemLista {
  id: string;
  codigo: string;
  titulo: string;
  prioridade: Prioridade;
  status: Status;
  solicitante: Pessoa;
  area: Pessoa;
  analista: Pessoa | null;
  dataSolicitacao: string;
  atualizadoEm: string;
}

export interface Solicitacao extends ItemLista {
  descricao: string;
  decisao: {
    resultado: 'APROVADA' | 'REJEITADA';
    comentario: string;
    decididoEm: string;
    decididoPor: Pessoa;
  } | null;
  versao: number;
  acoesPermitidas: Acao[];
  integracao: Integracao | null;
}

export type StatusIntegracao = 'PENDENTE' | 'ENVIADO' | 'FALHOU';
export type TipoEventoIntegracao = 'SolicitacaoAprovada' | 'SolicitacaoReaberta';

/**
 * Integração com o sistema externo (ADR-010). Os campos de topo são do evento em foco (o mais
 * antigo ainda não ENVIADO; se todos foram, o mais recente); `aguardando` conta os não enviados
 * depois dele; `eventos` traz todos, em ordem cronológica.
 */
export interface Integracao {
  status: StatusIntegracao;
  tipo: TipoEventoIntegracao;
  tentativas: number;
  maxTentativas: number;
  proximaTentativaEm: string;
  enviadaEm: string | null;
  aguardando: number;
  eventos: {
    id: string;
    tipo: TipoEventoIntegracao;
    status: StatusIntegracao;
    tentativas: number;
    criadoEm: string;
    enviadaEm: string | null;
  }[];
}

export interface EventoHistorico {
  id: string;
  tipo: string;
  statusAnterior: Status | null;
  statusNovo: Status | null;
  comentario: string | null;
  autor: Pessoa;
  dados: Record<string, unknown> | null;
  criadoEm: string;
}

export interface Pagina {
  data: ItemLista[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Resumo {
  escopo: 'GERAL' | 'PROPRIAS';
  total: number;
  porStatus: Record<Status, number>;
  porPrioridade: Record<Prioridade, number>;
  filaAlta: number;
  aberturaMaisAntiga: string | null;
  geradoEm: string;
}

const TIPO_ERRO = 'https://solicitacoes.local/erros';

/** Chamadas HTTP com o Bearer da sessão (ou sem token, quando `sessao` não vem). */
export function api(app: INestApplication<App>, sessao?: Sessao) {
  const agente = () => request(app.getHttpServer());
  const autenticar = (chamada: request.Test): request.Test =>
    sessao ? chamada.set('Authorization', `Bearer ${sessao.token}`) : chamada;
  return {
    get: (url: string) => autenticar(agente().get(`${BASE}${url}`)),
    post: (url: string) => autenticar(agente().post(`${BASE}${url}`)),
    patch: (url: string) => autenticar(agente().patch(`${BASE}${url}`)),
    delete: (url: string) => autenticar(agente().delete(`${BASE}${url}`)),
  };
}

/** Login real. O rate limit é de 5 por minuto por e-mail: entre uma vez por usuário no beforeAll. */
export async function entrar(
  app: INestApplication<App>,
  email: string,
  senha: string = SENHA_SEED,
): Promise<Sessao> {
  const resposta = await request(app.getHttpServer())
    .post(`${BASE}/auth/login`)
    .send({ email, senha })
    .expect(200);
  const corpo = resposta.body as { accessToken: string; usuario: Omit<Sessao, 'token'> };
  return { token: corpo.accessToken, ...corpo.usuario };
}

/** Entra com os usuários do seed informados, uma vez cada. */
export async function entrarComSeed<A extends Apelido>(
  app: INestApplication<App>,
  apelidos: readonly A[],
): Promise<Record<A, Sessao>> {
  const sessoes = {} as Record<A, Sessao>;
  for (const apelido of apelidos) {
    sessoes[apelido] = await entrar(app, EMAILS_SEED[apelido]);
  }
  return sessoes;
}

const SENHA_PESSOA = 'Senha-da-pessoa@2026';

/** Solicitante próprio do teste (área Financeiro), já com sessão aberta. */
export async function entrarComSolicitanteNovo(
  app: INestApplication<App>,
  owner: Client,
): Promise<Sessao> {
  const pessoa = await criarUsuarioComSenha(owner, SENHA_PESSOA);
  return entrar(app, pessoa.email, SENHA_PESSOA);
}

/** Texto único para achar, pela busca, só as solicitações criadas por um teste. */
export function marcador(): string {
  return `marca${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

export interface NovaSolicitacao {
  titulo?: string;
  descricao?: string;
  prioridade?: Prioridade;
}

export async function criarSolicitacao(
  app: INestApplication<App>,
  sessao: Sessao,
  campos: NovaSolicitacao = {},
): Promise<Solicitacao> {
  const resposta = await api(app, sessao)
    .post('/solicitacoes')
    .send({
      titulo: 'Acesso ao sistema de cobrança',
      descricao: 'Preciso de acesso de leitura ao módulo de cobrança para conciliar os boletos.',
      prioridade: 'MEDIA',
      ...campos,
    })
    .expect(201);
  return resposta.body as Solicitacao;
}

export const COMENTARIO = 'Acesso liberado conforme a política de perfis de leitura.';
export const JUSTIFICATIVA = 'A aprovação considerou o perfil errado; precisa de nova análise.';

export function iniciarAnalise(app: INestApplication<App>, sessao: Sessao, id: string) {
  return api(app, sessao).post(`/solicitacoes/${id}/analise`).send();
}

export function decidir(
  app: INestApplication<App>,
  sessao: Sessao,
  id: string,
  resultado: 'APROVADA' | 'REJEITADA' = 'APROVADA',
  comentario: string = COMENTARIO,
) {
  return api(app, sessao).post(`/solicitacoes/${id}/decisao`).send({ resultado, comentario });
}

export function reabrir(
  app: INestApplication<App>,
  sessao: Sessao,
  id: string,
  justificativa: string = JUSTIFICATIVA,
) {
  return api(app, sessao).post(`/solicitacoes/${id}/reabertura`).send({ justificativa });
}

/**
 * Cria uma solicitação do `dono` e a leva até `status` pelos comandos da API: o `analista` inicia
 * a análise e decide (ou o `decisor`, quando informado).
 */
export async function solicitacaoEm(
  app: INestApplication<App>,
  status: Status,
  pessoas: { dono: Sessao; analista: Sessao; decisor?: Sessao },
  campos: NovaSolicitacao = {},
): Promise<Solicitacao> {
  const criada = await criarSolicitacao(app, pessoas.dono, campos);
  if (status === 'ABERTA') return criada;

  const emAnalise = await iniciarAnalise(app, pessoas.analista, criada.id).expect(200);
  if (status === 'EM_ANALISE') return emAnalise.body as Solicitacao;

  const decidida = await decidir(
    app,
    pessoas.decisor ?? pessoas.analista,
    criada.id,
    status,
  ).expect(200);
  return decidida.body as Solicitacao;
}

/** ADR-010: reprocessamento da integração (Admin). */
export function reprocessar(app: INestApplication<App>, sessao: Sessao, id: string) {
  return api(app, sessao).post(`/solicitacoes/${id}/integracao/reprocessamento`).send();
}

export async function detalhe(
  app: INestApplication<App>,
  sessao: Sessao,
  id: string,
): Promise<Solicitacao> {
  const resposta = await api(app, sessao).get(`/solicitacoes/${id}`).expect(200);
  return resposta.body as Solicitacao;
}

export async function historico(
  app: INestApplication<App>,
  sessao: Sessao,
  id: string,
): Promise<EventoHistorico[]> {
  const resposta = await api(app, sessao).get(`/solicitacoes/${id}/historico`).expect(200);
  return resposta.body as EventoHistorico[];
}

export async function listar(
  app: INestApplication<App>,
  sessao: Sessao,
  query: string,
): Promise<Pagina> {
  const resposta = await api(app, sessao).get(`/solicitacoes?${query}`).expect(200);
  return resposta.body as Pagina;
}

export async function resumo(app: INestApplication<App>, sessao: Sessao): Promise<Resumo> {
  const resposta = await api(app, sessao).get('/dashboard/resumo').expect(200);
  return resposta.body as Resumo;
}

/** Muda a data da solicitação direto no banco (app_owner), para testar ordenação e o resumo. */
export async function definirData(owner: Client, id: string, data: Date): Promise<string> {
  const resultado = await owner.query<{ data: Date }>(
    'UPDATE solicitacoes SET data_solicitacao = $2 WHERE id = $1 RETURNING data_solicitacao AS data',
    [id, data],
  );
  return resultado.rows[0]!.data.toISOString();
}

export function esperarProblema(resposta: request.Response, status: number, code: string): void {
  expect({ status: resposta.status, code: (resposta.body as { code?: string }).code }).toEqual({
    status,
    code,
  });
  expect(resposta.headers['content-type']).toContain('application/problem+json');
  expect(resposta.body).toMatchObject({
    type: `${TIPO_ERRO}/${code.toLowerCase().replaceAll('_', '-')}`,
    title: expect.any(String),
    status,
    code,
  });
}

export function ordenar<T>(valores: readonly T[]): T[] {
  return [...valores].sort();
}
