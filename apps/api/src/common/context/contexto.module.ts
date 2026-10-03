import type { IncomingMessage } from 'node:http';
import { ClsModule } from 'nestjs-cls';
import { pluginTransacional } from '../../database/transacao';
import { garantirRequestId } from './request-id';

/**
 * Contexto da requisição (CLS): requestId e transação corrente, acessíveis em qualquer camada
 * sem passar parâmetro à mão.
 */
export const ContextoModule = ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: IncomingMessage) => garantirRequestId(req),
  },
  plugins: [pluginTransacional],
});
