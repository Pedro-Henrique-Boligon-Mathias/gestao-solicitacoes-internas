import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Cargos } from '../src/common/decorators/cargos.decorator';
import { UsuarioAtual } from '../src/common/decorators/usuario-atual.decorator';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/database/prisma.service';
import { assinarJwt } from './apoio/jwt';

const AREA = { id: randomUUID(), nome: 'Tecnologia', ativo: true };

function pessoa(nome: string, cargo: 'SOLICITANTE' | 'ANALISTA' | 'ADMIN') {
  return {
    id: randomUUID(),
    nome,
    email: `${nome.toLowerCase().replace(' ', '.')}@teste.local`,
    senhaHash: 'hash-de-teste',
    cargo,
    areaId: AREA.id,
    ativo: true,
    area: AREA,
  };
}

const ANA = pessoa('Ana Souza', 'SOLICITANTE');
const CARLA = pessoa('Carla Mendes', 'ANALISTA');
const USUARIOS = [ANA, CARLA];

function sessaoDe(usuario: (typeof USUARIOS)[number]) {
  return {
    id: randomUUID(),
    usuarioId: usuario.id,
    familiaId: randomUUID(),
    refreshHash: randomUUID(),
    expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    usadoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    usuario,
  };
}

const SESSOES = USUARIOS.map(sessaoDe);

/** Procura o registro pelo `id` do `where` (ou devolve null), como o findUnique/findFirst do Prisma. */
function buscaPorId<T extends { id: string }>(registros: T[]) {
  const buscar = jest.fn(({ where }: { where?: { id?: string } } = {}) =>
    Promise.resolve(registros.find((registro) => registro.id === where?.id) ?? null),
  );
  return {
    findUnique: buscar,
    findFirst: buscar,
    findUniqueOrThrow: buscar,
    findFirstOrThrow: buscar,
  };
}

function tokenDe(usuario: (typeof USUARIOS)[number]): string {
  const sessao = SESSOES.find((linha) => linha.usuarioId === usuario.id)!;
  return assinarJwt({ sub: usuario.id, cargo: usuario.cargo, areaId: AREA.id, sid: sessao.id });
}

/** Controller só de teste, protegido pelo JwtAuthGuard global e pelo CargosGuard. */
@Controller('teste-autorizacao')
class ControllerDeAutorizacao {
  @Get('analise')
  @Cargos('ANALISTA', 'ADMIN')
  analisar(): { ok: true } {
    return { ok: true };
  }

  @Get('eu')
  quemSou(@UsuarioAtual() usuario: unknown): unknown {
    return usuario;
  }
}

// Sem banco: o PrismaService é trocado por um falso que conhece só os usuários e sessões acima.
describe('ADR-005: guards e decorators de autorização', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControllerDeAutorizacao],
    })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: buscaPorId(USUARIOS),
        sessao: buscaPorId(SESSOES),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = modulo.createNestApplication();
    configurarApp(app, { origemWeb: 'http://localhost:3000' });
    // Servidor próprio em 127.0.0.1 (o motivo está em test/integracao/api-http.ts)
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('ADR-005: @Cargos(ANALISTA, ADMIN) recusa SOLICITANTE com 403 ACESSO_NEGADO', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/api/v1/teste-autorizacao/analise')
      .set('Authorization', `Bearer ${tokenDe(ANA)}`)
      .expect(403);

    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body).toMatchObject({
      type: 'https://solicitacoes.local/erros/acesso-negado',
      status: 403,
      code: 'ACESSO_NEGADO',
    });
  });

  it('ADR-005: @Cargos(ANALISTA, ADMIN) deixa o ANALISTA passar (200)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/teste-autorizacao/analise')
      .set('Authorization', `Bearer ${tokenDe(CARLA)}`)
      .expect(200, { ok: true });
  });

  it('ADR-005: sem token, a rota protegida responde 401 NAO_AUTENTICADO antes do CargosGuard', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/api/v1/teste-autorizacao/analise')
      .expect(401);
    expect(resposta.body).toMatchObject({ code: 'NAO_AUTENTICADO' });
  });

  it('ADR-005: @UsuarioAtual() entrega { id, nome, cargo, areaId } do usuário do token', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/api/v1/teste-autorizacao/eu')
      .set('Authorization', `Bearer ${tokenDe(CARLA)}`)
      .expect(200);

    expect(resposta.body).toEqual({
      id: CARLA.id,
      nome: 'Carla Mendes',
      cargo: 'ANALISTA',
      areaId: AREA.id,
    });
  });
});
