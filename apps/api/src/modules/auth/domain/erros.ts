import { ErroDeDominio } from '../../../common/errors/erro-de-dominio';

/** Mesma resposta para e-mail inexistente, senha errada e usuário inativo (RN-15). */
export class CredenciaisInvalidasError extends ErroDeDominio {
  readonly code = 'CREDENCIAIS_INVALIDAS';

  constructor() {
    super('E-mail ou senha inválidos.');
  }
}

/** Refresh token desconhecido, expirado, revogado, reusado ou de usuário inativo. */
export class SessaoInvalidaError extends ErroDeDominio {
  readonly code = 'SESSAO_INVALIDA';

  constructor() {
    super('Sessão expirada ou inválida. Entre novamente.');
  }
}
