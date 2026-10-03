import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/database/prisma.service';
import { VerificadorBanco, type EstadoComponente } from '../src/health/verificador-banco';

describe('API (HTTP)', () => {
  let app: INestApplication<App>;
  let estadoBanco: EstadoComponente;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $disconnect: jest.fn() })
      .overrideProvider(VerificadorBanco)
      .useValue({ verificar: () => Promise.resolve(estadoBanco) })
      .compile();

    app = modulo.createNestApplication();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    estadoBanco = 'up';
  });

  it('GET /health/live responde 200', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
  });

  it('GET /health/ready responde 200 quando o banco está acessível', async () => {
    const resposta = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(resposta.body).toEqual({ status: 'ok', details: { database: { status: 'up' } } });
  });

  it('GET /health/ready responde 503 quando o banco está fora do ar', async () => {
    estadoBanco = 'down';
    const resposta = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(resposta.body).toEqual({ status: 'error', details: { database: { status: 'down' } } });
  });

  it('devolve o X-Request-Id recebido', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'teste-123');
    expect(resposta.headers['x-request-id']).toBe('teste-123');
  });

  it('gera um X-Request-Id quando o recebido é inválido', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'com espaço <script>');
    expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('responde rotas inexistentes com Problem Details', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/api/v1/nao-existe')
      .set('X-Request-Id', 'teste-404')
      .expect(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body).toMatchObject({
      type: 'about:blank',
      title: 'Recurso não encontrado',
      status: 404,
      instance: '/api/v1/nao-existe',
      requestId: 'teste-404',
    });
  });

  it('publica a documentação OpenAPI', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(resposta.body.info.title).toBe('Gestão de Solicitações Internas');
  });
});
