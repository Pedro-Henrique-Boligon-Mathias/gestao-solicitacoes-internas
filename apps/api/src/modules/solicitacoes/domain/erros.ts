import { ErroDeDominio } from '../../../common/errors/erro-de-dominio';

/** Não existe, foi excluída ou o usuário não pode vê-la: a resposta não revela qual (404). */
export class SolicitacaoNaoEncontrada extends ErroDeDominio {
  readonly code = 'SOLICITACAO_NAO_ENCONTRADA';

  constructor() {
    super('Solicitação não encontrada.');
  }
}

/** O usuário vê a solicitação, mas o cargo ou o papel dele não permite a ação (403). */
export class AcessoNegado extends ErroDeDominio {
  readonly code = 'ACESSO_NEGADO';

  constructor(detail = 'Você não tem permissão para esta ação.') {
    super(detail);
  }
}

/** RN-07: ninguém analisa, decide ou reabre a própria solicitação (403). */
export class SegregacaoDeFuncoes extends ErroDeDominio {
  readonly code = 'SEGREGACAO_DE_FUNCOES';

  constructor(detail = 'Você não pode analisar, decidir ou reabrir a própria solicitação.') {
    super(detail);
  }
}

/** O comando não vale para o status atual (409). */
export class TransicaoInvalida extends ErroDeDominio {
  readonly code = 'TRANSICAO_INVALIDA';
}

/** Edição ou exclusão fora do status permitido (409). */
export class EdicaoBloqueada extends ErroDeDominio {
  readonly code = 'EDICAO_BLOQUEADA';
}

/** A `versao` enviada não é a atual: alguém alterou antes (409). */
export class ConflitoDeVersao extends ErroDeDominio {
  readonly code = 'CONFLITO_DE_VERSAO';

  constructor() {
    super('A solicitação foi alterada por outra pessoa. Recarregue a página e tente de novo.');
  }
}
