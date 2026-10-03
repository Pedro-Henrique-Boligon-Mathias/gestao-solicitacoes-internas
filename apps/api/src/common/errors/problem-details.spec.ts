import { NotFoundException } from '@nestjs/common';
import { paraProblemDetails } from './problem-details';

describe('ADR-008: paraProblemDetails', () => {
  const contexto = { instance: '/api/v1/solicitacoes/123', requestId: 'req-1' };

  it('ADR-008: NotFoundException vira NAO_ENCONTRADO com type URL e detail', () => {
    expect(
      paraProblemDetails(new NotFoundException('Solicitação não encontrada.'), contexto),
    ).toMatchObject({
      type: 'https://solicitacoes.local/erros/nao-encontrado',
      title: expect.any(String),
      status: 404,
      code: 'NAO_ENCONTRADO',
      detail: 'Solicitação não encontrada.',
      instance: '/api/v1/solicitacoes/123',
      requestId: 'req-1',
    });
  });

  it('ADR-008: erro inesperado vira ERRO_INTERNO sem detail e sem a mensagem original', () => {
    const problema = paraProblemDetails(new Error('senha do banco: 123'), contexto);
    expect(problema).toMatchObject({
      type: 'https://solicitacoes.local/erros/erro-interno',
      status: 500,
      code: 'ERRO_INTERNO',
      requestId: 'req-1',
    });
    expect(problema).not.toHaveProperty('detail');
    expect(JSON.stringify(problema)).not.toContain('senha do banco');
  });

  it('ADR-008: omite o requestId quando ele não existe', () => {
    expect(paraProblemDetails(new Error('x'), { instance: '/' })).not.toHaveProperty('requestId');
  });
});
