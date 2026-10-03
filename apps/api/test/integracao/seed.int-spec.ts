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

describe('P-10: seed de áreas e usuários', () => {
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

  beforeAll(async () => {
    banco = `seed_${randomUUID().replaceAll('-', '')}`;
    await criarBancoMigrado(banco);
    rodarSeed();
    rodarSeed();
    owner = await conectar('owner', banco);
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
});
