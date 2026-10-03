# Gestão de Solicitações Internas

Protótipo web para centralizar solicitações internas, acompanhar o andamento de cada uma e disponibilizar indicadores da operação.

> **Status:** fundação do projeto concluída (monorepo, Docker, banco de dados, testes e CI). As funcionalidades de solicitações estão em desenvolvimento.

## Stack

| Camada         | Tecnologia                                                              |
| -------------- | ----------------------------------------------------------------------- |
| Front-end      | Next.js 16 (App Router), React 19, Tailwind CSS 4                       |
| Back-end       | NestJS 11, Prisma 7                                                     |
| Banco de dados | PostgreSQL 17                                                           |
| Contratos      | OpenAPI gerado dos DTOs zod da API (`apps/api/openapi.json`)            |
| Testes         | Jest + Supertest + Testcontainers (API), Vitest + Testing Library (web) |
| Infraestrutura | Docker Compose, GitHub Actions                                          |

## Como executar

Pré-requisito: [Docker](https://docs.docker.com/get-docker/) com Docker Compose.

```bash
docker compose up --build
```

O Compose sobe o banco, aplica as migrations, roda o seed e inicia a API e a interface web. Os valores padrão servem para uso local. Para trocá-los, copie `.env.example` para `.env` e edite.

| Serviço                       | Endereço                                |
| ----------------------------- | --------------------------------------- |
| Aplicação web                 | http://localhost:3000                   |
| API                           | http://localhost:3001                   |
| Documentação da API (Swagger) | http://localhost:3001/api/docs          |
| PostgreSQL                    | `localhost:5432` (banco `solicitacoes`) |

Para parar e apagar os dados: `docker compose down --volumes`.

### Variáveis de ambiente

Todas têm padrão local no `compose.yaml`; o `.env.example` traz os mesmos valores para o desenvolvimento fora do Docker.

| Variável                                                          | Padrão local                                          | Uso                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`, `APP_OWNER_PASSWORD`, `APP_RUNTIME_PASSWORD` | `postgres-local`, `owner-local`, `runtime-local`      | Senhas do superusuário e dos papéis do banco                                                         |
| `DB_PORT`                                                         | `5432`                                                | Porta do Postgres no host                                                                            |
| `SEED_PASSWORD`                                                   | `Demo@2026`                                           | Senha dos usuários de demonstração                                                                   |
| `JWT_SECRET`                                                      | `segredo-local-de-desenvolvimento-troque-em-producao` | Assinatura dos access tokens (HS256). Obrigatória, com 32+ caracteres; troque fora do ambiente local |
| `ACCESS_TOKEN_TTL`                                                | `15m`                                                 | Validade do access token                                                                             |
| `REFRESH_TOKEN_DIAS`                                              | `7`                                                   | Validade de cada refresh token                                                                       |
| `REFRESH_GRACA_SEGUNDOS`                                          | `10`                                                  | Janela em que um refresh recém-trocado ainda é aceito (duas abas renovando juntas)                   |
| `COOKIE_SECURE`                                                   | `false`                                               | Marca os cookies de sessão como `Secure`. Use `true` só atrás de HTTPS                               |
| `LOG_LEVEL`                                                       | `info`                                                | Nível dos logs da API                                                                                |

### Usuários de demonstração

Criados pelo seed. A senha de todos é o valor de `SEED_PASSWORD` (padrão `Demo@2026`). Entre em http://localhost:3000/login com qualquer um deles, por exemplo `carla.mendes@demo.test` / `Demo@2026`.

| Nome         | E-mail                 | Cargo         | Área             |
| ------------ | ---------------------- | ------------- | ---------------- |
| Ana Souza    | ana.souza@demo.test    | Solicitante   | Financeiro       |
| Bruno Lima   | bruno.lima@demo.test   | Solicitante   | Recursos Humanos |
| Camila Rocha | camila.rocha@demo.test | Solicitante   | Comercial        |
| Carla Mendes | carla.mendes@demo.test | Analista      | Tecnologia       |
| Rafael Costa | rafael.costa@demo.test | Analista      | Tecnologia       |
| Diego Alves  | diego.alves@demo.test  | Administrador | Tecnologia       |

## Desenvolvimento local

Pré-requisitos: Node.js 24+, pnpm 10 (`corepack enable` ou `npm install -g pnpm@10`) e Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O `pnpm dev` sobe a API (porta 3001) e a web (porta 3000) com recarga automática.

### Scripts

| Comando                 | O que faz                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`              | API e web em modo de desenvolvimento                                                  |
| `pnpm test`             | Testes de todos os pacotes                                                            |
| `pnpm lint`             | ESLint em todos os pacotes                                                            |
| `pnpm typecheck`        | Checagem de tipos                                                                     |
| `pnpm build`            | Build de produção                                                                     |
| `pnpm format`           | Formata o código com Prettier                                                         |
| `pnpm test:integration` | Testes de integração da API com Postgres real (requer Docker)                         |
| `pnpm contract:check`   | Regenera o `openapi.json` e os tipos do web e falha se mudarem                        |
| `pnpm verify`           | Tudo que a CI verifica: formatação, lint, tipos, testes, build, contrato e integração |
| `pnpm db:migrate`       | Aplica as migrations                                                                  |
| `pnpm db:seed`          | Cria as áreas e os usuários de demonstração                                           |
| `pnpm db:reset`         | Recria o banco do zero (apaga os dados)                                               |

## Estrutura

```text
├── apps/
│   ├── api/                  # NestJS
│   │   ├── openapi.json      # contrato gerado e versionado
│   │   ├── prisma/           # schema, migrations (SQL versionado) e seed
│   │   ├── src/
│   │   │   ├── common/       # erros (Problem Details), guards, decorators, contexto e logs
│   │   │   ├── config/       # validação das variáveis de ambiente
│   │   │   ├── database/     # cliente Prisma e transação com contexto do usuário
│   │   │   ├── modules/      # módulos de negócio (auth: sessões; health: liveness e readiness)
│   │   │   └── openapi/      # geração do contrato
│   │   └── test/             # testes HTTP e de integração (integracao/)
│   └── web/                  # Next.js
│       └── src/
│           ├── app/          # rotas (App Router)
│           ├── components/
│           └── lib/          # acesso à API pelo servidor
├── infra/db/init/            # criação dos papéis do banco
├── compose.yaml
└── .github/workflows/ci.yml
```

## Decisões da fundação

- **OpenAPI como contrato.** Os DTOs zod da API geram o `apps/api/openapi.json`, versionado. O web gera os tipos e o client a partir dele. `pnpm contract:check` (no pre-push e na CI) falha se o contrato commitado estiver desatualizado.

  ```text
  DTOs zod (api) → openapi.json → tipos gerados (web) → client tipado
  ```

- **O navegador só conversa com o Next.** As chamadas à API são feitas pelo servidor do Next, na rede interna do Docker.
- **Dois papéis no banco.** `app_owner` é dono do schema e roda migrations e seed. `app_runtime` é o único papel usado pela API: lê e grava solicitações e sessões, mas não apaga nada, não altera o histórico e não acessa a tabela de migrations.
- **Contexto do usuário no banco.** A API grava o usuário e o cargo com `set_config` local à transação; as funções `app.usuario_atual()` e `app.cargo_atual()` leem esse contexto e devolvem `NULL` fora dele.
- **Busca sem acento.** `app.sem_acento()` (extensão `unaccent`) com índice trigram (`pg_trgm`): buscar "solicitacao" encontra "Solicitação".
- **Integridade no banco.** CHECKs garantem que uma solicitação decidida sempre tenha comentário, data e autor da decisão, que decisões e reaberturas no histórico tenham comentário, e que ninguém analise ou decida a própria solicitação.
- **Autenticação própria.** Login com e-mail e senha (argon2id). A API devolve um access token JWT de 15 minutos e um refresh token opaco de 7 dias, que é trocado a cada uso; no banco fica só o hash dele. Reusar um refresh já trocado (fora de uma janela de 10 segundos) revoga a sessão inteira. O Next guarda os dois em cookies httpOnly, e o navegador nunca vê os tokens. A cada requisição a API confere se o usuário segue ativo e se a sessão não foi encerrada.
- **Rate limit no login.** 5 requisições por minuto por e-mail no login e por refresh token na renovação, contando também as que dão certo. O IP fica fora da chave porque o `X-Forwarded-For` pode ser forjado. O contador fica em memória, o que serve para uma réplica; com várias, ele iria para o Redis. O IP gravado na sessão serve só de auditoria: é o informado pelo cliente, repassado pelo Next. No Docker, a porta da API é publicada só em `127.0.0.1`. Efeito colateral aceito: 5 tentativas erradas, de quem quer que seja, bloqueiam o login daquela conta por 1 minuto.
- **Erros padronizados.** Toda resposta de erro segue o formato Problem Details (RFC 9457), com um `requestId` que também aparece nos logs.
- **Logs estruturados.** A API registra em JSON, com o identificador de cada requisição.
- **Configuração validada.** A API não sobe se faltar variável de ambiente ou se alguma estiver inválida.

## Qualidade

- **pre-commit:** bloqueia arquivos `.env`, chaves e certificados, e roda ESLint e Prettier nos arquivos alterados.
- **commit-msg:** exige mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/).
- **pre-push:** formatação, lint, tipos, testes e contrato OpenAPI.
- **CI (GitHub Actions):** em todo PR e push na `main`, roda a validação completa (com o contrato OpenAPI), os testes de integração com Postgres real, sobe o ambiente Docker do zero e verifica a API e a web, e faz uma varredura de segredos.

Os hooks são instalados automaticamente pelo `pnpm install`.
