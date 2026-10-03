import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  CARLA,
  SENHA_SEED,
  criarBancoComSeed,
  ipNovo,
  sessaoDoRefresh,
  sessoesDaFamilia,
  subirApi,
} from './api-http';
import { conectar } from './banco';

// Graça de 1 segundo, para o teste conseguir sair dela sem esperar os 10 segundos do padrão.
const GRACA_SEGUNDOS = 1;

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

describe('ADR-004: reuso de refresh token fora do período de graça', () => {
  let app: INestApplication<App>;
  let owner: Client;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('auth_reuso');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { REFRESH_GRACA_SEGUNDOS: String(GRACA_SEGUNDOS) });
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  const http = () => request(app.getHttpServer());

  function renovar(refreshToken: string) {
    return http()
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', ipNovo())
      .send({ refreshToken });
  }

  it('ADR-004: reusar fora da graça → 401 SESSAO_INVALIDA, família revogada por REUSO e o refresh mais novo também cai', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ipNovo())
      .send({ email: CARLA.email, senha: SENHA_SEED })
      .expect(200);
    const original = login.body.refreshToken as string;

    const troca = await renovar(original).expect(200);
    const maisNovo = troca.body.refreshToken as string;
    const accessMaisNovo = troca.body.accessToken as string;

    await esperar(GRACA_SEGUNDOS * 1000 + 500);

    const reuso = await renovar(original);
    expect(reuso.status).toBe(401);
    expect(reuso.headers['content-type']).toContain('application/problem+json');
    expect(reuso.body).toMatchObject({ status: 401, code: 'SESSAO_INVALIDA' });

    const { familia_id: familiaId } = await sessaoDoRefresh(owner, original);
    const familia = await sessoesDaFamilia(owner, familiaId);
    expect(familia.length).toBeGreaterThanOrEqual(2);
    for (const sessao of familia) {
      expect(sessao.revogada_em).not.toBeNull();
      expect(sessao.motivo_revogacao).toBe('REUSO');
    }

    const depois = await renovar(maisNovo);
    expect(depois.status).toBe(401);
    expect(depois.body).toMatchObject({ code: 'SESSAO_INVALIDA' });

    // O access da família revogada também deixa de valer
    const perfil = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessMaisNovo}`);
    expect(perfil.status).toBe(401);
    expect(perfil.body).toMatchObject({ code: 'NAO_AUTENTICADO' });
  });
});
