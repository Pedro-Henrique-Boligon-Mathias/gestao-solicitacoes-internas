// Impede que arquivos de ambiente, chaves e certificados entrem num commit.
import { execFileSync } from 'node:child_process';

const PERMITIDOS = [/(^|\/)\.env\.example$/];
const BLOQUEADOS = [
  /(^|\/)\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|crt|cer)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/,
];

const preparados = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const sensiveis = preparados.filter(
  (arquivo) =>
    !PERMITIDOS.some((regra) => regra.test(arquivo)) &&
    BLOQUEADOS.some((regra) => regra.test(arquivo)),
);

if (sensiveis.length > 0) {
  console.error('Commit bloqueado: remova estes arquivos sensíveis da área de staging:');
  for (const arquivo of sensiveis) console.error(`  - ${arquivo}`);
  console.error('Use o .env.example apenas com valores fictícios.');
  process.exit(1);
}
