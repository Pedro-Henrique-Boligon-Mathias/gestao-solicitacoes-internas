import { SetMetadata } from '@nestjs/common';

export const CHAVE_PUBLICO = 'rota-publica';

/** Libera a rota do JwtAuthGuard global (login, refresh e probes de saúde). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PUBLICO, true);
