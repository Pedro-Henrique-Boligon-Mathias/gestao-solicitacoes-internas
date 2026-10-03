import { AcessoNegado, EdicaoBloqueada, SegregacaoDeFuncoes, TransicaoInvalida } from './erros';
import { transicionar, type Comando } from './maquina-de-estados';
import {
  ACOES,
  ROTULO_STATUS,
  type Acao,
  type Resultado,
  type SolicitacaoDominio,
  type UsuarioDominio,
} from './tipos';

const COMANDO_DA_ACAO: Record<'INICIAR_ANALISE' | 'DECIDIR' | 'REABRIR', Comando> = {
  INICIAR_ANALISE: 'INICIAR_ANALISE',
  DECIDIR: 'APROVAR',
  REABRIR: 'REABRIR',
};

const SEGREGACAO: Record<'INICIAR_ANALISE' | 'DECIDIR' | 'REABRIR', string> = {
  INICIAR_ANALISE: 'Você não pode analisar a própria solicitação.',
  DECIDIR: 'Você não pode decidir a própria solicitação.',
  REABRIR: 'Você não pode reabrir a própria solicitação.',
};

function verificarEdicao(
  usuario: UsuarioDominio,
  solicitacao: SolicitacaoDominio,
  acao: 'EDITAR' | 'EXCLUIR',
): void {
  const admin = usuario.cargo === 'ADMIN';
  const dono = solicitacao.solicitanteId === usuario.id;
  const verbo = acao === 'EDITAR' ? 'editada' : 'excluída';

  // Cargo e papel: só o dono ou um administrador (RN-02, RN-09)
  if (!admin && !dono) {
    throw new AcessoNegado(
      `Só quem abriu a solicitação ou um administrador pode ${acao === 'EDITAR' ? 'editá-la' : 'excluí-la'}.`,
    );
  }

  // Status: o dono, só em ABERTA; o administrador, enquanto não houver decisão (RN-08)
  const { status } = solicitacao;
  const decidida = status === 'APROVADA' || status === 'REJEITADA';
  if (decidida) {
    throw new EdicaoBloqueada(
      `Uma solicitação com status ${ROTULO_STATUS[status]} não pode ser ${verbo}.`,
    );
  }
  if (!admin && status !== 'ABERTA') {
    throw new EdicaoBloqueada(
      `Depois que a análise começa, a solicitação não pode mais ser ${verbo} por quem a abriu.`,
    );
  }
}

function verificarComando(
  usuario: UsuarioDominio,
  solicitacao: SolicitacaoDominio,
  acao: 'INICIAR_ANALISE' | 'DECIDIR' | 'REABRIR',
  resultado?: Resultado,
): void {
  // 1. Cargo
  if (usuario.cargo === 'SOLICITANTE') {
    throw new AcessoNegado(
      acao === 'REABRIR'
        ? 'Só um administrador pode reabrir uma solicitação decidida.'
        : 'Só analistas e administradores podem analisar e decidir solicitações.',
    );
  }
  if (acao === 'REABRIR' && usuario.cargo !== 'ADMIN') {
    throw new AcessoNegado('Só um administrador pode reabrir uma solicitação decidida.');
  }

  // 2. Segregação de funções (RN-07)
  if (solicitacao.solicitanteId === usuario.id) {
    throw new SegregacaoDeFuncoes(SEGREGACAO[acao]);
  }

  // 3. Status (máquina de estados)
  const comando =
    acao === 'DECIDIR' && resultado === 'REJEITADA' ? 'REJEITAR' : COMANDO_DA_ACAO[acao];
  transicionar(solicitacao.status, comando);

  // 4. Responsável: o analista só decide o que ele mesmo analisa; o administrador decide qualquer uma (RN-05)
  if (acao === 'DECIDIR' && usuario.cargo === 'ANALISTA' && solicitacao.analistaId !== usuario.id) {
    throw new AcessoNegado(
      'Só o analista responsável ou um administrador pode decidir esta solicitação.',
    );
  }
}

/**
 * ADR-010: só o administrador devolve à fila um evento de integração que falhou, e só quando o
 * evento em foco (o que segura a fila da solicitação) está em FALHOU.
 */
function verificarReprocessamento(usuario: UsuarioDominio, solicitacao: SolicitacaoDominio): void {
  if (usuario.cargo !== 'ADMIN') {
    throw new AcessoNegado('Só um administrador pode reprocessar a integração.');
  }
  if (solicitacao.statusIntegracao !== 'FALHOU') {
    throw new TransicaoInvalida(
      'A integração desta solicitação não está com falha; não há o que reprocessar.',
    );
  }
}

/**
 * Lança o erro da primeira regra que bloqueia a ação, nesta ordem: cargo/papel (403) →
 * segregação de funções (403) → status (409) → analista responsável (403). Não faz nada se a ação
 * é permitida. `resultado` só ajusta a mensagem de uma decisão fora de EM_ANALISE.
 */
export function verificarAcao(
  usuario: UsuarioDominio,
  solicitacao: SolicitacaoDominio,
  acao: Acao,
  resultado?: Resultado,
): void {
  if (acao === 'EDITAR' || acao === 'EXCLUIR') {
    verificarEdicao(usuario, solicitacao, acao);
  } else if (acao === 'REPROCESSAR_INTEGRACAO') {
    verificarReprocessamento(usuario, solicitacao);
  } else {
    verificarComando(usuario, solicitacao, acao, resultado);
  }
}

/** As ações que `verificarAcao` libera: a mesma regra bloqueia na API e desenha os botões na UI. */
export function acoesPermitidas(usuario: UsuarioDominio, solicitacao: SolicitacaoDominio): Acao[] {
  return ACOES.filter((acao) => {
    try {
      verificarAcao(usuario, solicitacao, acao);
      return true;
    } catch {
      return false;
    }
  });
}
