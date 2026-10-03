import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';

/** Configuração HTTP compartilhada entre o main.ts e os testes, para testar o que roda de verdade. */
export function configurarApp(app: INestApplication, opcoes: { origemWeb: string }): void {
  app.use(helmet());
  app.enableCors({ origin: opcoes.origemWeb });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Gestão de Solicitações Internas')
      .setDescription('API para registro, análise e acompanhamento de solicitações internas.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
}
