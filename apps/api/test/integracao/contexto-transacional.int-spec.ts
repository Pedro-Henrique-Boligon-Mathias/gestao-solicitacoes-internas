import { Controller, Get, Injectable, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Public } from '../../src/common/decorators/publico.decorator';
import { ContextoBanco } from '../../src/database/contexto-banco';
import { PrismaService } from '../../src/database/prisma.service';
import { Transactional } from '../../src/database/transacao';
import { urlBanco } from './ambiente';
import { CARLA, SENHA_SEED, criarBancoComSeed, ipNovo } from './api-http';

interface LinhaContexto {
  usuario: string | null;
  cargo: string | null;
}

/** Provider só de teste: lê o contexto do banco dentro de uma transação aberta por @Transactional(). */
@Injectable()
class LeitorDeContexto {
  constructor(private readonly contexto: ContextoBanco) {}

  @Transactional()
  async lerNaTransacao(): Promise<LinhaContexto> {
    const linhas = await this.contexto.cliente.$queryRaw<LinhaContexto[]>`
      SELECT app.usuario_atual()::text AS usuario, app.cargo_atual() AS cargo`;
    return linhas[0]!;
  }
}

@Controller('teste-contexto-transacional')
class ControllerDeContexto {
  constructor(private readonly leitor: LeitorDeContexto) {}

  @Get('autenticada')
  autenticada(): Promise<LinhaContexto> {
    return this.leitor.lerNaTransacao();
  }

  @Get('publica')
  @Public()
  publica(): Promise<LinhaContexto> {
    return this.leitor.lerNaTransacao();
  }
}

// Um banco só deste arquivo, com o seed; a API conecta nele como app_runtime.
describe('ADR-005: @Transactional() aplica o contexto do usuário autenticado', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let carlaId: string;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('ctx_tx');
    // O ConfigModule valida o ambiente ao carregar o módulo: a URL entra antes do import.
    process.env.DATABASE_URL = urlBanco('runtime', banco);

    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../../src/app.module.js');
    const { configurarApp } = await import('../../src/configurar-app.js');

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControllerDeContexto],
      providers: [LeitorDeContexto],
    }).compile();
    app = modulo.createNestApplication<INestApplication<App>>();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    // Servidor próprio em 127.0.0.1 (o motivo está em test/integracao/api-http.ts)
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ipNovo())
      .send({ email: CARLA.email, senha: SENHA_SEED })
      .expect(200);
    const corpo = login.body as { accessToken: string; usuario: { id: string } };
    accessToken = corpo.accessToken;
    carlaId = corpo.usuario.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  /** Consulta direto no pool, sem transação nem contexto. */
  async function lerSemContexto(): Promise<LinhaContexto> {
    const linhas = await prisma.$queryRaw<LinhaContexto[]>`
      SELECT app.usuario_atual()::text AS usuario, app.cargo_atual() AS cargo`;
    return linhas[0]!;
  }

  it('ADR-005: numa requisição autenticada, o método @Transactional() vê o usuário e o cargo logados', async () => {
    const resposta = await http()
      .get('/api/v1/teste-contexto-transacional/autenticada')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(resposta.body).toEqual({ usuario: carlaId, cargo: CARLA.cargo });
  });

  it('ADR-005: numa rota @Public() sem token, o mesmo método vê NULL nas duas funções', async () => {
    const resposta = await http().get('/api/v1/teste-contexto-transacional/publica').expect(200);

    expect(resposta.body).toEqual({ usuario: null, cargo: null });
  });

  it('ADR-005: depois de requisições autenticadas, consultas sem contexto no pool continuam vendo NULL', async () => {
    // Várias requisições em paralelo, para passar o contexto por mais de uma conexão do pool.
    const respostas = await Promise.all(
      Array.from({ length: 8 }, () =>
        http()
          .get('/api/v1/teste-contexto-transacional/autenticada')
          .set('Authorization', `Bearer ${accessToken}`),
      ),
    );
    for (const resposta of respostas) {
      expect(resposta.status).toBe(200);
      expect(resposta.body).toEqual({ usuario: carlaId, cargo: CARLA.cargo });
    }

    const lidas = await Promise.all(Array.from({ length: 8 }, () => lerSemContexto()));
    for (const lida of lidas) {
      expect(lida).toEqual({ usuario: null, cargo: null });
    }

    // E a rota pública, que reaproveita as mesmas conexões, também não herda nada.
    const publica = await http().get('/api/v1/teste-contexto-transacional/publica').expect(200);
    expect(publica.body).toEqual({ usuario: null, cargo: null });
  });
});
