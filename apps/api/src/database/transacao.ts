import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { DatabaseModule } from './database.module';
import { PrismaService } from './prisma.service';

export { Transactional } from '@nestjs-cls/transactional';

export type AdaptadorPrisma = TransactionalAdapterPrisma<PrismaService>;

/**
 * Guarda a transação corrente no CLS. Os repositórios usam `ContextoBanco.cliente` e recebem a
 * transação aberta por `@Transactional()` ou por `ContextoBanco.executarComUsuario`.
 */
export const pluginTransacional = new ClsPluginTransactional({
  imports: [DatabaseModule],
  adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PrismaService }),
});
