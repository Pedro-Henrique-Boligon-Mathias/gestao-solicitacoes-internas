import { SetMetadata } from '@nestjs/common';
import type { Cargo } from '../../generated/prisma/client';

export const CHAVE_CARGOS = 'cargos-permitidos';

/** Restringe a rota a alguns cargos; quem não tiver um deles recebe 403 ACESSO_NEGADO. */
export const Cargos = (...cargos: Cargo[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_CARGOS, cargos);
