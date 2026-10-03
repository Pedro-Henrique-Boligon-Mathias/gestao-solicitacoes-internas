// Ajusta o package.json da API, só dentro do build Docker, antes do `pnpm deploy`.
//
// O @prisma/client e o adaptador transacional declaram o CLI `prisma` como peer. Como o CLI está
// nas devDependencies, o pnpm amarra esse peer e o leva para a produção (mais de 200 MB entre CLI,
// engines, Studio e typescript). Sem as devDependencies no manifesto, o deploy instala só o que
// cada imagem usa.
//
// Uso: node docker/manifesto-imagem.mjs <runtime|migrate>
import { readFileSync, writeFileSync } from 'node:fs';

const CAMINHO = new URL('../package.json', import.meta.url);
const manifesto = JSON.parse(readFileSync(CAMINHO, 'utf8'));
const { dependencies = {}, devDependencies = {} } = manifesto;

function escolher(origem, nomes) {
  return Object.fromEntries(
    nomes.map((nome) => {
      if (!origem[nome]) throw new Error(`Dependência ausente no package.json da API: ${nome}`);
      return [nome, origem[nome]];
    }),
  );
}

const imagens = {
  // API: só as dependências de produção e o build
  runtime: () => ({ dependencies, files: ['dist'] }),
  // Migrations e seed: CLI do Prisma, tsx para o seed em TypeScript e o client gerado
  migrate: () => ({
    dependencies: {
      ...escolher(dependencies, ['@node-rs/argon2', '@prisma/adapter-pg', '@prisma/client']),
      ...escolher(devDependencies, ['dotenv', 'prisma', 'tsx']),
    },
    files: ['prisma', 'prisma.config.ts', 'src/generated'],
  }),
};

const imagem = process.argv[2];
if (!(imagem in imagens)) {
  throw new Error(`Imagem desconhecida: ${imagem}. Use runtime ou migrate.`);
}

const ajustado = { ...manifesto, ...imagens[imagem]() };
delete ajustado.devDependencies;
writeFileSync(CAMINHO, `${JSON.stringify(ajustado, null, 2)}\n`);
