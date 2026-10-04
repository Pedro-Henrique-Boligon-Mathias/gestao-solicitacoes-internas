import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';

describe('ADR-009: health contra banco real', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    // Servidor próprio em 127.0.0.1 (o motivo está em test/integracao/api-http.ts)
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('ADR-009: GET /health/ready responde 200 com o banco no ar', async () => {
    const resposta = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(resposta.body).toEqual({ status: 'ok', details: { database: { status: 'up' } } });
  });
});
