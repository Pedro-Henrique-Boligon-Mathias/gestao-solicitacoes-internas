/**
 * Códigos estáveis de erro (campo `code` do Problem Details) que as camadas de domínio e de
 * aplicação podem lançar. O filtro global traduz cada um para o status HTTP correspondente.
 */
export type CodigoDeErro =
  | 'NAO_AUTENTICADO'
  | 'CREDENCIAIS_INVALIDAS'
  | 'SESSAO_INVALIDA'
  | 'ACESSO_NEGADO'
  | 'MUITAS_TENTATIVAS'
  | 'SOLICITACAO_NAO_ENCONTRADA'
  | 'SEGREGACAO_DE_FUNCOES'
  | 'TRANSICAO_INVALIDA'
  | 'EDICAO_BLOQUEADA'
  | 'CONFLITO_DE_VERSAO';

/** Erro tipado, sem dependência de Nest ou de HTTP. */
export abstract class ErroDeDominio extends Error {
  abstract readonly code: CodigoDeErro;

  constructor(readonly detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

export class NaoAutenticadoError extends ErroDeDominio {
  readonly code = 'NAO_AUTENTICADO';

  constructor() {
    super('Faça login para continuar.');
  }
}

export class AcessoNegadoError extends ErroDeDominio {
  readonly code = 'ACESSO_NEGADO';

  constructor() {
    super('Você não tem permissão para esta ação.');
  }
}

export class MuitasTentativasError extends ErroDeDominio {
  readonly code = 'MUITAS_TENTATIVAS';

  constructor() {
    super('Muitas tentativas. Aguarde 1 minuto.');
  }
}
