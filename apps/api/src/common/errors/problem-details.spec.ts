import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { paraProblemDetails } from './problem-details';

describe('paraProblemDetails', () => {
  const contexto = { instance: '/api/v1/solicitacoes/123', requestId: 'req-1' };

  it('usa o status e a mensagem de uma HttpException', () => {
    expect(
      paraProblemDetails(new NotFoundException('Solicitação não encontrada.'), contexto),
    ).toEqual({
      type: 'about:blank',
      title: 'Recurso não encontrado',
      status: 404,
      detail: 'Solicitação não encontrada.',
      instance: '/api/v1/solicitacoes/123',
      requestId: 'req-1',
    });
  });

  it('junta mensagens múltiplas de validação', () => {
    const problema = paraProblemDetails(
      new BadRequestException({ message: ['titulo é obrigatório', 'prioridade inválida'] }),
      contexto,
    );
    expect(problema.status).toBe(400);
    expect(problema.detail).toBe('titulo é obrigatório; prioridade inválida');
  });

  it('dá um título genérico a códigos sem título mapeado', () => {
    expect(paraProblemDetails(new ConflictException(), contexto).title).toBe('Conflito');
  });

  it('esconde os detalhes de erros inesperados', () => {
    const problema = paraProblemDetails(new Error('senha do banco: 123'), contexto);
    expect(problema.status).toBe(500);
    expect(problema.title).toBe('Erro interno');
    expect(JSON.stringify(problema)).not.toContain('senha do banco');
    expect(problema.requestId).toBe('req-1');
  });

  it('omite o requestId quando ele não existe', () => {
    expect(paraProblemDetails(new Error('x'), { instance: '/' })).not.toHaveProperty('requestId');
  });
});
