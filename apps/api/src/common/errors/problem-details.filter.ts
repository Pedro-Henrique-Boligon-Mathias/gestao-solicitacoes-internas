import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { garantirRequestId } from '../context/request-id';
import { paraProblemDetails } from './problem-details';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(excecao: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requisicao = http.getRequest<Request>();
    const resposta = http.getResponse<Response>();

    const problema = paraProblemDetails(excecao, {
      // Só o caminho: a query string pode trazer dados que não devem voltar no erro
      instance: requisicao.originalUrl.split('?')[0] ?? requisicao.originalUrl,
      requestId: garantirRequestId(requisicao, resposta),
    });

    if (problema.status >= 500) {
      this.logger.error(
        { err: excecao, requestId: problema.requestId },
        'Erro não tratado na requisição',
      );
    }

    resposta.status(problema.status).type('application/problem+json').json(problema);
  }
}
