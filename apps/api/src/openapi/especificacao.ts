import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ProblemDetails } from '../common/errors/problem-details.schema';

/** Documento OpenAPI da aplicação, gerado a partir dos controllers e dos DTOs zod. */
export function criarEspecificacaoOpenApi(app: INestApplication): OpenAPIObject {
  const configuracao = new DocumentBuilder()
    .setTitle('Gestão de Solicitações Internas')
    .setDescription('API para registro, análise e acompanhamento de solicitações internas.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, configuracao, { extraModels: [ProblemDetails] }),
  );
}
