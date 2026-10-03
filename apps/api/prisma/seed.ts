import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient, type Cargo } from '../src/generated/prisma/client';

config({ path: '../../.env', quiet: true });

const AREAS = [
  'Tecnologia',
  'Financeiro',
  'Recursos Humanos',
  'Jurídico',
  'Comercial',
  'Operações',
] as const;

type Area = (typeof AREAS)[number];

const USUARIOS_DEMO: { nome: string; email: string; cargo: Cargo; area: Area }[] = [
  { nome: 'Ana Souza', email: 'ana.souza@demo.test', cargo: 'SOLICITANTE', area: 'Financeiro' },
  {
    nome: 'Bruno Lima',
    email: 'bruno.lima@demo.test',
    cargo: 'SOLICITANTE',
    area: 'Recursos Humanos',
  },
  {
    nome: 'Camila Rocha',
    email: 'camila.rocha@demo.test',
    cargo: 'SOLICITANTE',
    area: 'Comercial',
  },
  { nome: 'Carla Mendes', email: 'carla.mendes@demo.test', cargo: 'ANALISTA', area: 'Tecnologia' },
  { nome: 'Rafael Costa', email: 'rafael.costa@demo.test', cargo: 'ANALISTA', area: 'Tecnologia' },
  { nome: 'Diego Alves', email: 'diego.alves@demo.test', cargo: 'ADMIN', area: 'Tecnologia' },
];

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  const senha = process.env.SEED_PASSWORD;
  if (!url || !senha) {
    throw new Error('Defina MIGRATION_DATABASE_URL e SEED_PASSWORD para rodar o seed.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const nome of AREAS) {
      await prisma.area.upsert({ where: { nome }, update: {}, create: { nome } });
    }

    // Idempotente: rodar de novo mantém os usuários de demonstração iguais ao README.
    const senhaHash = await hash(senha);
    for (const usuario of USUARIOS_DEMO) {
      const dados = {
        nome: usuario.nome,
        cargo: usuario.cargo,
        senhaHash,
        ativo: true,
        area: { connect: { nome: usuario.area } },
      };
      await prisma.usuario.upsert({
        where: { email: usuario.email },
        update: dados,
        create: { ...dados, email: usuario.email },
      });
    }

    console.log(`Seed concluído: ${AREAS.length} áreas e ${USUARIOS_DEMO.length} usuários.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
