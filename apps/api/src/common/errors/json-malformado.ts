import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export class JsonMalformadoException extends BadRequestException {
  constructor() {
    super('O corpo da requisição não é um JSON válido.');
  }
}

/** Troca o erro do body-parser (mensagem em inglês, vinda do JSON.parse) por uma exceção própria. */
export function converterJsonMalformado(
  erro: unknown,
  _requisicao: Request,
  _resposta: Response,
  proximo: NextFunction,
): void {
  const falhaDeParse =
    erro instanceof SyntaxError && (erro as { type?: unknown }).type === 'entity.parse.failed';
  proximo(falhaDeParse ? new JsonMalformadoException() : erro);
}
