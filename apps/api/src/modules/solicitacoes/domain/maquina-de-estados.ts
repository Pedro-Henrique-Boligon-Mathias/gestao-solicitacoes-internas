import { TransicaoInvalida } from './erros';
import { ROTULO_STATUS, type Status } from './tipos';

export type Comando = 'INICIAR_ANALISE' | 'APROVAR' | 'REJEITAR' | 'REABRIR';

/** Tabela de transições (nota de domínio). "Devolver à fila" fica para depois. */
const TRANSICOES: Record<Comando, Partial<Record<Status, Status>>> = {
  INICIAR_ANALISE: { ABERTA: 'EM_ANALISE' },
  APROVAR: { EM_ANALISE: 'APROVADA' },
  REJEITAR: { EM_ANALISE: 'REJEITADA' },
  REABRIR: { APROVADA: 'ABERTA', REJEITADA: 'ABERTA' },
};

const VERBO: Record<Comando, string> = {
  INICIAR_ANALISE: 'ter a análise iniciada',
  APROVAR: 'ser aprovada',
  REJEITAR: 'ser rejeitada',
  REABRIR: 'ser reaberta',
};

function orientacao(status: Status, comando: Comando): string {
  if (comando === 'APROVAR' || comando === 'REJEITAR') {
    return status === 'ABERTA' ? ' Inicie a análise primeiro.' : ' Ela já foi decidida.';
  }
  if (comando === 'REABRIR') return ' Só solicitações decididas podem ser reabertas.';
  return ' A análise já foi iniciada por outra pessoa ou a solicitação já foi decidida.';
}

/** Status que o comando produz a partir de `status`, ou `TransicaoInvalida` fora da tabela. */
export function transicionar(status: Status, comando: Comando): Status {
  const destino = TRANSICOES[comando][status];
  if (!destino) {
    throw new TransicaoInvalida(
      `Uma solicitação com status ${ROTULO_STATUS[status]} não pode ${VERBO[comando]}.` +
        orientacao(status, comando),
    );
  }
  return destino;
}
