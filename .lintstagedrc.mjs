// Cada pacote tem a própria configuração do ESLint, então o lint roda dentro da pasta dele.
const eslintNoPacote = (pasta) => (arquivos) =>
  `pnpm --dir ${pasta} exec eslint --fix --max-warnings=0 ${arquivos.map((a) => JSON.stringify(a)).join(' ')}`;

export default {
  'apps/api/**/*.{ts,js,mjs}': [eslintNoPacote('apps/api'), 'prettier --write'],
  'apps/web/**/*.{ts,tsx,js,mjs}': [eslintNoPacote('apps/web'), 'prettier --write'],
  '*.{json,md,yml,yaml,css}': 'prettier --write',
};
