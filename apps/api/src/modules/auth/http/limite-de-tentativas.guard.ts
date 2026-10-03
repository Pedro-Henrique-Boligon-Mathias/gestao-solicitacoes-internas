import { Injectable, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MuitasTentativasError } from '../../../common/errors/erro-de-dominio';
import { hashDoRefresh } from '../application/tokens';

type ChaveDoLimite = 'email' | 'refreshToken';
const CHAVE_DO_LIMITE = 'chave-do-limite';

/** Define, por rota, qual campo do corpo identifica quem está tentando. */
export const LimitarPor = (campo: ChaveDoLimite) => SetMetadata(CHAVE_DO_LIMITE, campo);

/**
 * Rate limit das rotas públicas de autenticação: por e-mail normalizado no login e por refresh
 * token (SHA-256) na renovação. A chave vem da rota, nunca do que o cliente decide mandar no corpo.
 * O IP fica fora da chave porque o X-Forwarded-For é informado pelo cliente. Toda requisição
 * conta, inclusive as bem-sucedidas.
 * O contador fica em memória (uma réplica); com várias réplicas, o armazenamento iria para o Redis.
 */
@Injectable()
export class LimiteDeTentativasGuard extends ThrottlerGuard {
  protected override getTracker(
    requisicao: Record<string, unknown>,
    contexto?: ExecutionContext,
  ): Promise<string> {
    const campo = contexto
      ? this.reflector.get<ChaveDoLimite | undefined>(CHAVE_DO_LIMITE, contexto.getHandler())
      : undefined;
    const valor = (requisicao.body as Record<string, unknown> | undefined)?.[campo ?? ''];

    // O guard roda antes da validação do corpo; sem o campo, a chave é só a rota e a validação dá 400
    if (typeof valor !== 'string') return Promise.resolve(`sem-chave:${campo ?? 'rota'}`);
    if (campo === 'email') return Promise.resolve(`email:${valor.trim().toLowerCase()}`);
    return Promise.resolve(`refresh:${hashDoRefresh(valor)}`);
  }

  protected override throwThrottlingException(): Promise<void> {
    throw new MuitasTentativasError();
  }
}
