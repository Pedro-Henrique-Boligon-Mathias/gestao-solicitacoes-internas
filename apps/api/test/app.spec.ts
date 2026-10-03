import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Public } from '../src/common/decorators/publico.decorator';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/database/prisma.service';

const TIPO_ERRO = 'https://solicitacoes.local/erros';

/** Rota pública que falha de um jeito inesperado, para observar a resposta 500. */
@Public()
@Controller('teste-erro')
class ControllerComFalha {
  @Get()
  falhar(): never {
    throw new Error('senha do banco: 123');
  }
}

describe('API (HTTP)', () => {
  let app: INestApplication<App>;
  let bancoNoAr: boolean;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControllerComFalha],
    })
      // Sem banco: a consulta de prontidão responde conforme `bancoNoAr`.
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn(() =>
          bancoNoAr ? Promise.resolve([{ ok: 1 }]) : Promise.reject(new Error('banco fora do ar')),
        ),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = modulo.createNestApplication();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bancoNoAr = true;
  });

  describe('ADR-009: probes de saúde', () => {
    it('ADR-009: GET /health/live responde 200', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    });

    it('ADR-009: GET /health/ready responde 200 quando o banco está acessível', async () => {
      const resposta = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(resposta.body).toEqual({ status: 'ok', details: { database: { status: 'up' } } });
    });

    it('ADR-009: GET /health/ready responde 503 quando o banco está fora do ar', async () => {
      bancoNoAr = false;
      const resposta = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(resposta.body).toEqual({ status: 'error', details: { database: { status: 'down' } } });
    });
  });

  describe('ADR-008: X-Request-Id', () => {
    it('ADR-008: devolve o X-Request-Id recebido quando ele é válido', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Request-Id', 'teste-123');
      expect(resposta.headers['x-request-id']).toBe('teste-123');
    });

    it('ADR-008: gera um X-Request-Id quando o recebido é inválido', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Request-Id', 'com espaço <script>');
      expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('ADR-008: Problem Details', () => {
    it('ADR-008: rota inexistente responde 404 NAO_ENCONTRADO em problem+json', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/nao-existe')
        .set('X-Request-Id', 'teste-404')
        .expect(404);

      expect(resposta.headers['content-type']).toContain('application/problem+json');
      expect(resposta.body).toMatchObject({
        type: `${TIPO_ERRO}/nao-encontrado`,
        title: expect.any(String),
        status: 404,
        code: 'NAO_ENCONTRADO',
        instance: '/api/v1/nao-existe',
        requestId: 'teste-404',
      });
      expect(resposta.body.requestId).toBe(resposta.headers['x-request-id']);
    });

    it('ADR-008: instance traz só o caminho, sem a query string', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/nao-existe?token=abc')
        .expect(404);
      expect(resposta.body.instance).toBe('/api/v1/nao-existe');
      expect(resposta.text).not.toContain('abc');
    });

    it('ADR-008: JSON malformado responde 400 DADOS_INVALIDOS com mensagem em pt-BR', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/nao-existe')
        .set('Content-Type', 'application/json')
        .send('{"titulo": ')
        .expect(400);

      expect(resposta.headers['content-type']).toContain('application/problem+json');
      expect(resposta.body).toMatchObject({
        status: 400,
        code: 'DADOS_INVALIDOS',
        detail: 'O corpo da requisição não é um JSON válido.',
      });
    });

    it('ADR-008: o requestId do corpo é o mesmo do header quando a API gera o id', async () => {
      const resposta = await request(app.getHttpServer()).get('/api/v1/nao-existe').expect(404);
      expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(resposta.body.requestId).toBe(resposta.headers['x-request-id']);
    });

    it('ADR-008: erro inesperado responde 500 ERRO_INTERNO sem detail e sem stack', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/teste-erro')
        .set('X-Request-Id', 'teste-500')
        .expect(500);

      expect(resposta.headers['content-type']).toContain('application/problem+json');
      expect(resposta.body).toMatchObject({
        type: `${TIPO_ERRO}/erro-interno`,
        title: expect.any(String),
        status: 500,
        code: 'ERRO_INTERNO',
        instance: '/api/v1/teste-erro',
        requestId: 'teste-500',
      });
      expect(resposta.body).not.toHaveProperty('detail');
      expect(resposta.body).not.toHaveProperty('stack');
      expect(resposta.text).not.toContain('senha do banco');
      expect(resposta.text).not.toContain('app.spec.ts');
    });
  });

  describe('ADR-001: documentação OpenAPI', () => {
    it('ADR-001: publica o documento usado pelo Swagger UI em /api/docs', async () => {
      const resposta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(resposta.body.info.title).toBe('Gestão de Solicitações Internas');
      expect(resposta.body.paths).toHaveProperty(['/health/ready']);
      expect(resposta.body.components.schemas).toHaveProperty('ProblemDetails');
    });
  });
});
