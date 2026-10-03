import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../../config/env';
import { garantirRequestId } from '../context/request-id';

/** Logs JSON no stdout com o requestId de cada requisição; senha, tokens e cookies mascarados. */
export const LoggingModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      genReqId: (req, res) => garantirRequestId(req, res),
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        // Corpos não são logados por padrão; se algum log incluir um, os segredos saem mascarados
        ...['senha', 'refreshToken', 'accessToken'].flatMap((campo) => [
          campo,
          `*.${campo}`,
          `*.*.${campo}`,
        ]),
      ],
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      ...(config.get('NODE_ENV', { infer: true }) === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  }),
});
