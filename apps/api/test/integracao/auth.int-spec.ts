import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { assinarJwt, lerClaims } from '../apoio/jwt';
import {
  CARLA,
  SENHA_SEED,
  criarBancoComSeed,
  criarUsuarioComSenha,
  ipNovo,
  sessaoDoRefresh,
  sessoesDaFamilia,
  sha256Hex,
  subirApi,
} from './api-http';
import { conectar } from './banco';

const TIPO_ERRO = 'https://solicitacoes.local/erros';
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

interface UsuarioAtual {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  area: { id: string; nome: string };
}

interface RespostaSessao {
  accessToken: string;
  accessExpiraEm: string;
  refreshToken: string;
  refreshExpiraEm: string;
  usuario: UsuarioAtual;
}

// Um banco só deste arquivo, com o seed; a API conecta nele como app_runtime.
describe('ADR-004 / ADR-005 / RN-15: autenticação', () => {
  let app: INestApplication<App>;
  let owner: Client;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('auth');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  const http = () => request(app.getHttpServer());

  function login(email: string, senha: string, ip = ipNovo()) {
    return http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .set('User-Agent', 'navegador-de-teste/1.0')
      .send({ email, senha });
  }

  async function entrar(email: string = CARLA.email, senha = SENHA_SEED): Promise<RespostaSessao> {
    const resposta = await login(email, senha).expect(200);
    return resposta.body as RespostaSessao;
  }

  /*
   * O rate limit do login é por e-mail (5 por minuto), então cada teste que precisa de uma sessão
   * entra com uma pessoa própria. A Carla do seed fica só para os testes que conferem os dados
   * dela (no máximo 5 logins neste arquivo), e nenhum teste depende da ordem dos outros.
   */
  const SENHA_PESSOA = 'Senha-da-pessoa@2026';

  async function novaPessoa(): Promise<{ id: string; email: string; senha: string }> {
    const pessoa = await criarUsuarioComSenha(owner, SENHA_PESSOA);
    return { ...pessoa, senha: SENHA_PESSOA };
  }

  async function entrarComPessoaNova(): Promise<RespostaSessao> {
    const pessoa = await novaPessoa();
    return entrar(pessoa.email, pessoa.senha);
  }

  function renovar(refreshToken: string, ip = ipNovo()) {
    return http().post('/api/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken });
  }

  function perfil(accessToken?: string) {
    const chamada = http().get('/api/v1/auth/me');
    return accessToken ? chamada.set('Authorization', `Bearer ${accessToken}`) : chamada;
  }

  function esperarProblema(
    resposta: request.Response,
    status: number,
    code: string,
    slug: string,
  ): void {
    expect(resposta.status).toBe(status);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body).toMatchObject({
      type: `${TIPO_ERRO}/${slug}`,
      title: expect.any(String),
      status,
      code,
      instance: expect.any(String),
      requestId: expect.any(String),
    });
  }

  describe('POST /auth/login', () => {
    it('ADR-004: credenciais certas → 200 com o par de tokens e o usuário', async () => {
      const antes = Date.now();
      const resposta = await login(CARLA.email, SENHA_SEED).expect(200);
      const corpo = resposta.body as RespostaSessao;

      expect(corpo).toEqual({
        accessToken: expect.any(String),
        accessExpiraEm: expect.stringMatching(ISO_UTC),
        refreshToken: expect.any(String),
        refreshExpiraEm: expect.stringMatching(ISO_UTC),
        usuario: {
          id: expect.any(String),
          nome: CARLA.nome,
          email: CARLA.email,
          cargo: CARLA.cargo,
          area: { id: expect.any(String), nome: CARLA.area },
        },
      });

      // Access de 15 minutos e refresh de 7 dias (padrões)
      const access = Date.parse(corpo.accessExpiraEm) - antes;
      expect(access).toBeGreaterThan(14 * MINUTO);
      expect(access).toBeLessThanOrEqual(16 * MINUTO);
      const refresh = Date.parse(corpo.refreshExpiraEm) - antes;
      expect(refresh).toBeGreaterThan(7 * DIA - MINUTO);
      expect(refresh).toBeLessThanOrEqual(7 * DIA + MINUTO);

      // JWT com sub, cargo, areaId e sid
      expect(corpo.accessToken.split('.')).toHaveLength(3);
      expect(lerClaims(corpo.accessToken)).toMatchObject({
        sub: corpo.usuario.id,
        cargo: CARLA.cargo,
        areaId: corpo.usuario.area.id,
        sid: expect.any(String),
      });

      // Refresh opaco: 32 bytes em base64url
      expect(corpo.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('ADR-004: login cria 1 sessão com o hash do refresh (o token em claro não vai para o banco)', async () => {
      const pessoa = await novaPessoa();
      const ip = ipNovo();
      const resposta = await login(pessoa.email, pessoa.senha, ip).expect(200);
      const corpo = resposta.body as RespostaSessao;

      const sessao = await sessaoDoRefresh(owner, corpo.refreshToken);
      expect(sessao.refresh_hash).toBe(sha256Hex(corpo.refreshToken));
      expect(sessao.usuario_id).toBe(corpo.usuario.id);
      expect(sessao.id).toBe(lerClaims(corpo.accessToken).sid);
      expect(sessao.usado_em).toBeNull();
      expect(sessao.revogada_em).toBeNull();
      expect(sessao.ip).toBe(ip);
      expect(sessao.user_agent).toBe('navegador-de-teste/1.0');
      expect(sessao.expira_em.toISOString()).toBe(corpo.refreshExpiraEm);

      // A família é nova: só esta sessão nela
      expect(await sessoesDaFamilia(owner, sessao.familia_id)).toHaveLength(1);

      const emClaro = await owner.query(
        'SELECT 1 FROM sessoes s WHERE position($1 in s::text) > 0',
        [corpo.refreshToken],
      );
      expect(emClaro.rowCount).toBe(0);
    });

    it('ADR-004: senha errada e e-mail inexistente → a mesma resposta 401 CREDENCIAIS_INVALIDAS', async () => {
      const senhaErrada = await login(CARLA.email, 'senha-errada');
      const inexistente = await login('ninguem@demo.test', SENHA_SEED);

      for (const resposta of [senhaErrada, inexistente]) {
        esperarProblema(resposta, 401, 'CREDENCIAIS_INVALIDAS', 'credenciais-invalidas');
        expect(resposta.body.detail).toBe('E-mail ou senha inválidos.');
      }

      // Mesmo corpo, tirando o requestId (único por requisição)
      const semRequestId = (corpo: Record<string, unknown>) => ({ ...corpo, requestId: null });
      expect(semRequestId(senhaErrada.body as Record<string, unknown>)).toEqual(
        semRequestId(inexistente.body as Record<string, unknown>),
      );
    });

    it('ADR-004: e-mail com maiúsculas e espaços funciona', async () => {
      const resposta = await login('  Carla.MENDES@Demo.Test ', SENHA_SEED).expect(200);
      expect(resposta.body.usuario.email).toBe(CARLA.email);
    });

    it('RN-15: usuário com ativo = false não faz login (401 CREDENCIAIS_INVALIDAS)', async () => {
      const senha = 'Senha-da-pessoa@2026';
      const pessoa = await criarUsuarioComSenha(owner, senha);
      await owner.query('UPDATE usuarios SET ativo = false WHERE id = $1', [pessoa.id]);

      const resposta = await login(pessoa.email, senha);

      esperarProblema(resposta, 401, 'CREDENCIAIS_INVALIDAS', 'credenciais-invalidas');
      expect(resposta.body.detail).toBe('E-mail ou senha inválidos.');
    });

    describe('rate limit por e-mail', () => {
      it('ADR-004: a 6ª tentativa com o mesmo e-mail no minuto → 429 MUITAS_TENTATIVAS, mesmo trocando o X-Forwarded-For', async () => {
        const pessoa = await novaPessoa();
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await login(pessoa.email, 'senha-errada', ipNovo()).expect(401);
        }

        const sexta = await login(pessoa.email, 'senha-errada', ipNovo());

        esperarProblema(sexta, 429, 'MUITAS_TENTATIVAS', 'muitas-tentativas');
        expect(sexta.body.detail).toBe('Muitas tentativas. Aguarde 1 minuto.');
      });

      it('ADR-004: o limite usa o e-mail normalizado (maiúsculas e espaços contam como o mesmo e-mail)', async () => {
        const pessoa = await novaPessoa();
        const variacoes = [
          pessoa.email,
          pessoa.email.toUpperCase(),
          `  ${pessoa.email} `,
          ` ${pessoa.email.toUpperCase()}`,
          pessoa.email,
        ];
        for (const email of variacoes) {
          await login(email, 'senha-errada', ipNovo()).expect(401);
        }

        const sexta = await login(`${pessoa.email.toUpperCase()}  `, 'senha-errada', ipNovo());

        esperarProblema(sexta, 429, 'MUITAS_TENTATIVAS', 'muitas-tentativas');
      });

      it('ADR-004: bloqueado, nem a senha certa entra no mesmo minuto', async () => {
        const pessoa = await novaPessoa();
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await login(pessoa.email, 'senha-errada', ipNovo()).expect(401);
        }

        const certa = await login(pessoa.email, pessoa.senha, ipNovo());

        esperarProblema(certa, 429, 'MUITAS_TENTATIVAS', 'muitas-tentativas');
      });

      it('ADR-004: 5 tentativas erradas num e-mail não bloqueiam outro e-mail vindo do mesmo IP', async () => {
        const bloqueada = await novaPessoa();
        const outra = await novaPessoa();
        const ip = ipNovo();
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await login(bloqueada.email, 'senha-errada', ip).expect(401);
        }
        esperarProblema(
          await login(bloqueada.email, 'senha-errada', ip),
          429,
          'MUITAS_TENTATIVAS',
          'muitas-tentativas',
        );

        await login(outra.email, 'senha-errada', ip).expect(401);
        await login(outra.email, outra.senha, ip).expect(200);
      });
    });
  });

  describe('POST /auth/refresh', () => {
    it('ADR-004: refresh troca o par; o token antigo fica com usado_em', async () => {
      const pessoa = await novaPessoa();
      const sessao = await entrar(pessoa.email, pessoa.senha);

      const resposta = await renovar(sessao.refreshToken).expect(200);
      const novo = resposta.body as RespostaSessao;

      expect(novo).toMatchObject({
        accessToken: expect.any(String),
        accessExpiraEm: expect.stringMatching(ISO_UTC),
        refreshExpiraEm: expect.stringMatching(ISO_UTC),
        usuario: { id: pessoa.id, email: pessoa.email },
      });
      expect(novo.refreshToken).not.toBe(sessao.refreshToken);
      expect(novo.accessToken).not.toBe(sessao.accessToken);

      const antiga = await sessaoDoRefresh(owner, sessao.refreshToken);
      const proxima = await sessaoDoRefresh(owner, novo.refreshToken);
      expect(antiga.usado_em).not.toBeNull();
      expect(antiga.revogada_em).toBeNull();
      expect(proxima.familia_id).toBe(antiga.familia_id);
      expect(proxima.usado_em).toBeNull();
      expect(lerClaims(novo.accessToken).sid).toBe(proxima.id);

      await perfil(novo.accessToken).expect(200);
    });

    it('ADR-004: reusar o token antigo dentro da graça → 200 com outro par, família não revogada', async () => {
      const sessao = await entrarComPessoaNova();
      const primeiro = (await renovar(sessao.refreshToken).expect(200)).body as RespostaSessao;

      const segundo = (await renovar(sessao.refreshToken).expect(200)).body as RespostaSessao;

      expect(segundo.refreshToken).not.toBe(primeiro.refreshToken);
      expect(segundo.refreshToken).not.toBe(sessao.refreshToken);

      const antiga = await sessaoDoRefresh(owner, sessao.refreshToken);
      expect((await sessaoDoRefresh(owner, segundo.refreshToken)).familia_id).toBe(
        antiga.familia_id,
      );
      for (const linha of await sessoesDaFamilia(owner, antiga.familia_id)) {
        expect(linha.revogada_em).toBeNull();
      }

      // Os dois pares continuam válidos
      await perfil(primeiro.accessToken).expect(200);
      await perfil(segundo.accessToken).expect(200);
      await renovar(primeiro.refreshToken).expect(200);
    });

    it('ADR-004: refresh desconhecido → 401 SESSAO_INVALIDA', async () => {
      const resposta = await renovar('token-que-nunca-existiu-0123456789abcdefghijk');
      esperarProblema(resposta, 401, 'SESSAO_INVALIDA', 'sessao-invalida');
    });

    it('ADR-004: refresh expirado → 401 SESSAO_INVALIDA', async () => {
      const sessao = await entrarComPessoaNova();
      await owner.query(
        "UPDATE sessoes SET expira_em = now() - interval '1 minute' WHERE refresh_hash = $1",
        [sha256Hex(sessao.refreshToken)],
      );

      const resposta = await renovar(sessao.refreshToken);
      esperarProblema(resposta, 401, 'SESSAO_INVALIDA', 'sessao-invalida');
    });

    it('ADR-004: refresh sem o campo refreshToken → 400 DADOS_INVALIDOS', async () => {
      const resposta = await http()
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', ipNovo())
        .send({});
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS', 'dados-invalidos');
    });

    it('ADR-004: três refreshes simultâneos com o mesmo token → todos 200, família não revogada, só a sessão original com usado_em', async () => {
      const sessao = await entrarComPessoaNova();

      const respostas = await Promise.all([
        renovar(sessao.refreshToken),
        renovar(sessao.refreshToken),
        renovar(sessao.refreshToken),
      ]);

      for (const resposta of respostas) {
        expect(resposta.status).toBe(200);
      }
      const novos = respostas.map((resposta) => (resposta.body as RespostaSessao).refreshToken);
      expect(new Set(novos).size).toBe(3);
      expect(novos).not.toContain(sessao.refreshToken);

      const original = await sessaoDoRefresh(owner, sessao.refreshToken);
      const familia = await sessoesDaFamilia(owner, original.familia_id);
      expect(familia).toHaveLength(4);
      for (const linha of familia) {
        expect(linha.revogada_em).toBeNull();
        expect(linha.motivo_revogacao).toBeNull();
      }
      expect(familia.filter((linha) => linha.usado_em !== null).map((linha) => linha.id)).toEqual([
        original.id,
      ]);

      // Os três pares continuam válidos
      for (const resposta of respostas) {
        await perfil((resposta.body as RespostaSessao).accessToken).expect(200);
      }
    });

    describe('rate limit por refresh token', () => {
      it('ADR-004: o 6º refresh com o mesmo token no minuto → 429 MUITAS_TENTATIVAS, mesmo trocando o X-Forwarded-For', async () => {
        const sessao = await entrarComPessoaNova();
        // 1ª troca e mais 4 reusos dentro da graça: todos atendidos
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await renovar(sessao.refreshToken, ipNovo()).expect(200);
        }

        const sexto = await renovar(sessao.refreshToken, ipNovo());

        esperarProblema(sexto, 429, 'MUITAS_TENTATIVAS', 'muitas-tentativas');
        expect(sexto.body.detail).toBe('Muitas tentativas. Aguarde 1 minuto.');
      });

      it('ADR-004: o mesmo token desconhecido repetido 6 vezes → 429 na 6ª, mesmo trocando o X-Forwarded-For', async () => {
        const token = `token-desconhecido-${ipNovo()}-0123456789abcdefghijk`;
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await renovar(token, ipNovo()).expect(401);
        }

        esperarProblema(
          await renovar(token, ipNovo()),
          429,
          'MUITAS_TENTATIVAS',
          'muitas-tentativas',
        );
      });

      it('ADR-004: um campo email extra no corpo não muda a chave do limite do refresh', async () => {
        const token = `token-desconhecido-${ipNovo()}-com-email-extra-0123456789`;
        for (let tentativa = 1; tentativa <= 5; tentativa++) {
          await http()
            .post('/api/v1/auth/refresh')
            .set('X-Forwarded-For', ipNovo())
            .send({ refreshToken: token, email: `extra${tentativa}@x.test` })
            .expect(401);
        }

        esperarProblema(
          await http()
            .post('/api/v1/auth/refresh')
            .set('X-Forwarded-For', ipNovo())
            .send({ refreshToken: token, email: 'extra6@x.test' }),
          429,
          'MUITAS_TENTATIVAS',
          'muitas-tentativas',
        );
      });

      it('ADR-004: refreshes de tokens diferentes vindos do mesmo IP não se bloqueiam', async () => {
        const ip = ipNovo();
        for (let tentativa = 1; tentativa <= 6; tentativa++) {
          await renovar(`token-desconhecido-${ip}-${tentativa}-0123456789abcdefghijk`, ip).expect(
            401,
          );
        }

        const sessao = await entrarComPessoaNova();
        await renovar(sessao.refreshToken, ip).expect(200);
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('ADR-004: depois do logout, o access ainda válido → 401 NAO_AUTENTICADO e o refresh → 401', async () => {
      const sessao = await entrarComPessoaNova();

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${sessao.accessToken}`)
        .expect(204);

      esperarProblema(await perfil(sessao.accessToken), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
      esperarProblema(
        await renovar(sessao.refreshToken),
        401,
        'SESSAO_INVALIDA',
        'sessao-invalida',
      );

      const linha = await sessaoDoRefresh(owner, sessao.refreshToken);
      expect(linha.revogada_em).not.toBeNull();
      expect(linha.motivo_revogacao).toBe('LOGOUT');
    });

    it('ADR-004: logout sem token → 401 NAO_AUTENTICADO', async () => {
      const resposta = await http().post('/api/v1/auth/logout');
      esperarProblema(resposta, 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });
  });

  describe('GET /auth/me (JwtAuthGuard)', () => {
    it('ADR-005: com token válido devolve o usuário com a área', async () => {
      const sessao = await entrar();

      const resposta = await perfil(sessao.accessToken).expect(200);

      expect(resposta.body).toEqual({
        id: sessao.usuario.id,
        nome: CARLA.nome,
        email: CARLA.email,
        cargo: CARLA.cargo,
        area: { id: sessao.usuario.area.id, nome: CARLA.area },
      });
    });

    it('ADR-005: sem token → 401 NAO_AUTENTICADO em Problem Details', async () => {
      esperarProblema(await perfil(), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });

    it('ADR-005: token inválido (não é JWT) → 401 NAO_AUTENTICADO', async () => {
      esperarProblema(await perfil('nao-e-um-jwt'), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });

    it('ADR-005: token com assinatura errada → 401 NAO_AUTENTICADO', async () => {
      const sessao = await entrarComPessoaNova();
      const claims = lerClaims(sessao.accessToken) as {
        sub: string;
        cargo: string;
        areaId: string;
        sid: string;
      };
      const falsificado = assinarJwt(
        { sub: claims.sub, cargo: 'ADMIN', areaId: claims.areaId, sid: claims.sid },
        { segredo: 'outro-segredo-qualquer-com-mais-de-32-caracteres' },
      );

      esperarProblema(await perfil(falsificado), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });

    it('ADR-005: token vencido → 401 NAO_AUTENTICADO', async () => {
      const sessao = await entrarComPessoaNova();
      const claims = lerClaims(sessao.accessToken) as {
        sub: string;
        cargo: string;
        areaId: string;
        sid: string;
      };
      const vencido = assinarJwt(
        { sub: claims.sub, cargo: claims.cargo, areaId: claims.areaId, sid: claims.sid },
        { validadeSegundos: -60 },
      );

      esperarProblema(await perfil(vencido), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });

    it('RN-15: um access emitido antes da desativação → 401 na próxima requisição', async () => {
      const senha = 'Senha-da-pessoa@2026';
      const pessoa = await criarUsuarioComSenha(owner, senha);
      const sessao = await entrar(pessoa.email, senha);
      await perfil(sessao.accessToken).expect(200);

      await owner.query('UPDATE usuarios SET ativo = false WHERE id = $1', [pessoa.id]);

      esperarProblema(await perfil(sessao.accessToken), 401, 'NAO_AUTENTICADO', 'nao-autenticado');
    });

    it('RN-15: usuário desativado também não renova a sessão (401 SESSAO_INVALIDA)', async () => {
      const senha = 'Senha-da-pessoa@2026';
      const pessoa = await criarUsuarioComSenha(owner, senha);
      const sessao = await entrar(pessoa.email, senha);

      await owner.query('UPDATE usuarios SET ativo = false WHERE id = $1', [pessoa.id]);

      esperarProblema(
        await renovar(sessao.refreshToken),
        401,
        'SESSAO_INVALIDA',
        'sessao-invalida',
      );
    });
  });

  describe('rotas públicas', () => {
    it('ADR-005: /health/live e /health/ready continuam públicos', async () => {
      await http().get('/health/live').expect(200, { status: 'ok' });
      await http().get('/health/ready').expect(200);
    });
  });
});
