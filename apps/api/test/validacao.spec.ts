import { Body, Controller, HttpCode, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { Public } from '../src/common/decorators/publico.decorator';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/database/prisma.service';

class DtoDeTeste extends createZodDto(
  z.object({
    titulo: z.string().min(5, 'O título deve ter pelo menos 5 caracteres.'),
    item: z.object({ quantidade: z.number() }),
  }),
) {}

/** Controller só de teste (público): o corpo passa pelo ZodValidationPipe global. */
@Public()
@Controller('teste-validacao')
class ControllerDeValidacao {
  @Post()
  @HttpCode(200)
  receber(@Body() corpo: DtoDeTeste): DtoDeTeste {
    return corpo;
  }
}

describe('ADR-008: validação com nestjs-zod', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControllerDeValidacao],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = modulo.createNestApplication();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    // Servidor próprio em 127.0.0.1 (o motivo está em test/integracao/api-http.ts)
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('ADR-008: corpo inválido responde 400 DADOS_INVALIDOS com errors por campo', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/api/v1/teste-validacao')
      .set('X-Request-Id', 'teste-400')
      .send({ titulo: 'abc', item: { quantidade: 'muitos' } })
      .expect(400);

    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body).toMatchObject({
      type: 'https://solicitacoes.local/erros/dados-invalidos',
      title: expect.any(String),
      status: 400,
      code: 'DADOS_INVALIDOS',
      instance: '/api/v1/teste-validacao',
      requestId: 'teste-400',
    });
    expect(resposta.body.errors).toEqual(
      expect.arrayContaining([
        { campo: 'titulo', mensagem: 'O título deve ter pelo menos 5 caracteres.' },
        { campo: 'item.quantidade', mensagem: expect.any(String) },
      ]),
    );
  });

  it('ADR-008: mensagens padrão do zod saem em pt-BR', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/api/v1/teste-validacao')
      .send({ titulo: 'Título válido', item: { quantidade: 'muitos' } })
      .expect(400);

    const erro = (resposta.body.errors as { campo: string; mensagem: string }[]).find(
      ({ campo }) => campo === 'item.quantidade',
    );
    expect(erro?.mensagem).toMatch(/inválid/i);
  });

  it('ADR-008: corpo válido passa pela validação', async () => {
    const corpo = { titulo: 'Título válido', item: { quantidade: 2 } };
    await request(app.getHttpServer())
      .post('/api/v1/teste-validacao')
      .send(corpo)
      .expect(200, corpo);
  });
});
