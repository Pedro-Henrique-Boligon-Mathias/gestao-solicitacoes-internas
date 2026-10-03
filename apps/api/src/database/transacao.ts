import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import {
  TransactionalAdapterPrisma,
  type PrismaTransactionalClient,
} from '@nestjs-cls/transactional-adapter-prisma';
import { contextoDoUsuarioAtual } from '../common/context/usuario-autenticado';
import { DatabaseModule } from './database.module';
import { PrismaService } from './prisma.service';

export { Transactional } from '@nestjs-cls/transactional';

export type AdaptadorPrisma = TransactionalAdapterPrisma<PrismaService>;

/**
 * Adaptador do Prisma que, ao abrir uma transação dentro de uma requisição autenticada, grava o
 * usuário e o cargo do JwtAuthGuard no contexto do banco (`set_config` local à transação). Fora de
 * uma rota autenticada (login, refresh, seed, testes), a transação abre sem contexto.
 */
class AdaptadorPrismaComContexto extends TransactionalAdapterPrisma<PrismaService> {
  constructor() {
    super({ prismaInjectionToken: PrismaService });
    const fabricaOriginal = this.optionsFactory;
    this.optionsFactory = (prisma) => {
      const opcoes = fabricaOriginal(prisma);
      return {
        ...opcoes,
        wrapWithTransaction: (opcoesTx, fn, setClient) => {
          let cliente: PrismaTransactionalClient<PrismaService> | undefined;
          const guardarCliente = (tx?: PrismaTransactionalClient<PrismaService>): void => {
            cliente = tx;
            setClient(tx);
          };
          return opcoes.wrapWithTransaction(
            opcoesTx,
            async (): Promise<unknown> => {
              const usuario = contextoDoUsuarioAtual();
              if (usuario && cliente) {
                await cliente.$executeRaw`
                  SELECT set_config('app.usuario_id', ${usuario.usuarioId}, true),
                         set_config('app.cargo', ${usuario.cargo}, true)`;
              }
              return (await fn()) as unknown;
            },
            guardarCliente,
          );
        },
      };
    };
  }
}

/**
 * Guarda a transação corrente no CLS. Os repositórios usam `ContextoBanco.cliente` e recebem a
 * transação aberta por `@Transactional()` ou por `ContextoBanco.executarComUsuario`.
 */
export const pluginTransacional = new ClsPluginTransactional({
  imports: [DatabaseModule],
  adapter: new AdaptadorPrismaComContexto(),
});
