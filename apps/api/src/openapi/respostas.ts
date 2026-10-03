import { applyDecorators } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDetails } from '../common/errors/problem-details.schema';

/** Documenta uma resposta de erro no formato Problem Details (application/problem+json). */
export function ApiProblema(status: number, description: string): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status,
      description,
      content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetails) } } },
    }),
  );
}
