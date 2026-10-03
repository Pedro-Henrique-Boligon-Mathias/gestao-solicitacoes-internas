import { lerConfiguracao } from './configuracao.ts';
import { criarServidor } from './servidor.ts';

const { porta, taxaDeFalha } = lerConfiguracao(process.env);
const servidor = criarServidor({ taxaDeFalha });

servidor.listen(porta, '0.0.0.0', () => {
  process.stdout.write(
    `${JSON.stringify({ hora: new Date().toISOString(), mensagem: 'ext-mock no ar', porta, taxaDeFalha })}\n`,
  );
});

function encerrar(): void {
  servidor.close(() => process.exit(0));
  servidor.closeAllConnections();
}

process.once('SIGTERM', encerrar);
process.once('SIGINT', encerrar);
