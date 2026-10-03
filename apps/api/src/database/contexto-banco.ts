import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { Cargo } from '../generated/prisma/client';
import type { AdaptadorPrisma } from './transacao';

export interface UsuarioDoContexto {
  usuarioId: string;
  cargo: Cargo;
}

/** Acesso ao banco com o contexto do usuário que a RLS usa (`app.usuario_atual()`, `app.cargo_atual()`). */
@Injectable()
export class ContextoBanco {
  constructor(
    private readonly txHost: TransactionHost<AdaptadorPrisma>,
    private readonly cls: ClsService,
  ) {}

  /** O cliente da transação corrente, quando houver; senão, o PrismaClient normal. */
  get cliente(): TransactionHost<AdaptadorPrisma>['tx'] {
    return this.txHost.tx;
  }

  /**
   * Roda `fn` numa transação com o usuário no contexto do banco. Confirma no fim e desfaz tudo se
   * `fn` lançar. O `set_config(..., true)` vale só para esta transação: nada vaza para outra
   * requisição que reaproveite a mesma conexão do pool.
   */
  executarComUsuario<T>(usuario: UsuarioDoContexto, fn: () => Promise<T>): Promise<T> {
    const executar = (): Promise<T> =>
      this.txHost.withTransaction(async () => {
        await this.txHost.tx.$executeRaw`
          SELECT set_config('app.usuario_id', ${usuario.usuarioId}, true),
                 set_config('app.cargo', ${usuario.cargo}, true)`;
        return fn();
      });

    // Fora de uma requisição HTTP (seed, jobs, testes) ainda não existe contexto CLS: abre um.
    return this.cls.isActive() ? executar() : this.cls.run(executar);
  }
}
