import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { converterJsonMalformado } from './common/errors/json-malformado';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { criarEspecificacaoOpenApi } from './openapi/especificacao';

/** Configuração HTTP compartilhada entre o main.ts e os testes, para testar o que roda de verdade. */
export function configurarApp(app: INestApplication, opcoes: { origemWeb: string }): void {
  // O IP do navegador chega em X-Forwarded-For, repassado pelo servidor do Next, e só é aceito
  // quando vem de loopback ou de redes internas (a rede do Docker, por exemplo). Esse IP é
  // informado pelo cliente e serve só de auditoria (sessoes.ip): não entra no rate limit nem em
  // nenhuma decisão de segurança.
  (app as NestExpressApplication).set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  app.use(helmet());
  // O parser de JSON entra aqui, e não no init do Nest, para o erro de JSON malformado
  // ser convertido logo em seguida numa mensagem própria, em pt-BR.
  (app as NestExpressApplication).useBodyParser('json');
  app.use(converterJsonMalformado);
  app.enableCors({ origin: opcoes.origemWeb });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  // Swagger UI em /api/docs, com o mesmo documento que vira o apps/api/openapi.json
  SwaggerModule.setup('api/docs', app, criarEspecificacaoOpenApi(app));
}
