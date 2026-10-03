import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { urlBanco, type Papel } from './ambiente';
import { aplicarMigrations } from './prisma-cli';

/** Códigos SQLSTATE usados nas asserções. */
export const SQLSTATE = {
  violacaoCheck: '23514',
  violacaoUnica: '23505',
  semPermissao: '42501',
} as const;

export async function conectar(papel: Papel, banco?: string): Promise<Client> {
  const cliente = new Client({ connectionString: urlBanco(papel, banco) });
  // Conexões que um teste com falha deixou abertas não derrubam o teardown do container.
  cliente.on('error', () => undefined);
  await cliente.connect();
  return cliente;
}

/** Cria um banco vazio (dono: app_owner) e aplica as migrations nele. */
export async function criarBancoMigrado(nome: string): Promise<void> {
  const superusuario = await conectar('superusuario');
  try {
    await superusuario.query(`CREATE DATABASE "${nome}" OWNER app_owner`);
    await superusuario.query(`GRANT CONNECT ON DATABASE "${nome}" TO app_runtime`);
  } finally {
    await superusuario.end();
  }
  aplicarMigrations(urlBanco('owner', nome));
}

export interface Pessoas {
  areaId: string;
  solicitanteId: string;
  analistaId: string;
  outroAnalistaId: string;
}

/** Área e usuários próprios de cada teste (nomes únicos), criados como app_owner. */
export async function criarPessoas(owner: Client): Promise<Pessoas> {
  const sufixo = randomUUID().slice(0, 8);
  const area = await owner.query<{ id: string }>(
    'INSERT INTO areas (nome) VALUES ($1) RETURNING id',
    [`Área de teste ${sufixo}`],
  );
  const areaId = area.rows[0]!.id;

  async function usuario(apelido: string, cargo: string): Promise<string> {
    const resultado = await owner.query<{ id: string }>(
      `INSERT INTO usuarios (nome, email, senha_hash, cargo, area_id)
       VALUES ($1, $2, 'hash-de-teste', $3, $4) RETURNING id`,
      [`Pessoa ${apelido}`, `${apelido}.${sufixo}@teste.local`, cargo, areaId],
    );
    return resultado.rows[0]!.id;
  }

  return {
    areaId,
    solicitanteId: await usuario('solicitante', 'SOLICITANTE'),
    analistaId: await usuario('analista', 'ANALISTA'),
    outroAnalistaId: await usuario('outro-analista', 'ANALISTA'),
  };
}

export type CamposSolicitacao = Partial<{
  titulo: string;
  descricao: string;
  prioridade: string;
  status: string;
  solicitante_id: string;
  area_id: string;
  analista_id: string | null;
  decisao_comentario: string | null;
  decidido_em: Date | null;
  decidido_por_id: string | null;
}>;

/** Insere uma solicitação com valores válidos por padrão, sobrescritos por `campos`. */
export async function inserirSolicitacao(
  cliente: Client,
  pessoas: Pessoas,
  campos: CamposSolicitacao = {},
): Promise<string> {
  const valores: Record<string, unknown> = {
    titulo: 'Acesso ao sistema de cobrança',
    descricao: 'Preciso de acesso de leitura ao módulo de cobrança.',
    prioridade: 'MEDIA',
    status: 'ABERTA',
    solicitante_id: pessoas.solicitanteId,
    area_id: pessoas.areaId,
    ...campos,
  };
  const colunas = Object.keys(valores);
  const parametros = colunas.map((_, indice) => `$${indice + 1}`);
  const resultado = await cliente.query<{ id: string }>(
    `INSERT INTO solicitacoes (${colunas.join(', ')}) VALUES (${parametros.join(', ')}) RETURNING id`,
    Object.values(valores),
  );
  return resultado.rows[0]!.id;
}

/** Campos de uma decisão completa (RN-06), tomada por `decididoPorId`. */
export function decisaoCompleta(decididoPorId: string): CamposSolicitacao {
  return {
    decisao_comentario: 'Acesso liberado conforme a política de perfis.',
    decidido_em: new Date(),
    decidido_por_id: decididoPorId,
  };
}
