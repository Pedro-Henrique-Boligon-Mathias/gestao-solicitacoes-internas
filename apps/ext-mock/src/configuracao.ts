export interface Configuracao {
  porta: number;
  /** Probabilidade (0 a 1) de responder 503 a um POST /eventos válido. */
  taxaDeFalha: number;
}

const PORTA_PADRAO = 4010;

function lerNumero(valor: string | undefined, nome: string, padrao: number): number {
  if (valor === undefined || valor.trim() === '') return padrao;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`${nome} inválida: ${JSON.stringify(valor)}.`);
  return numero;
}

/** Lê MOCK_PORTA (padrão 4010) e MOCK_FAILURE_RATE (0 a 1, padrão 0); valores inválidos impedem a subida. */
export function lerConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const porta = lerNumero(env.MOCK_PORTA, 'MOCK_PORTA', PORTA_PADRAO);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65_535) {
    throw new Error(`MOCK_PORTA inválida: ${JSON.stringify(env.MOCK_PORTA)}. Use de 1 a 65535.`);
  }
  const taxaDeFalha = lerNumero(env.MOCK_FAILURE_RATE, 'MOCK_FAILURE_RATE', 0);
  if (taxaDeFalha < 0 || taxaDeFalha > 1) {
    throw new Error(
      `MOCK_FAILURE_RATE inválida: ${JSON.stringify(env.MOCK_FAILURE_RATE)}. Use de 0 a 1.`,
    );
  }
  return { porta, taxaDeFalha };
}
