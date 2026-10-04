# Gestão de Solicitações Internas

Protótipo web para centralizar solicitações internas, acompanhar o andamento de cada uma e disponibilizar indicadores da operação.

> **Status:** fundação do projeto concluída (monorepo, Docker, banco de dados, testes e CI). As funcionalidades de solicitações estão em desenvolvimento.

## Stack

| Camada         | Tecnologia                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| Front-end      | Next.js 16 (App Router), React 19, Tailwind CSS 4                                         |
| Back-end       | NestJS 11, Prisma 7                                                                       |
| Banco de dados | PostgreSQL 17                                                                             |
| Contratos      | OpenAPI gerado dos DTOs zod da API (`apps/api/openapi.json`)                              |
| Testes         | Jest + Supertest + Testcontainers (API), Vitest + Testing Library (web), Playwright (E2E) |
| Infraestrutura | Docker Compose, GitHub Actions                                                            |

## Como executar

Pré-requisito: [Docker](https://docs.docker.com/get-docker/) com Docker Compose.

```bash
docker compose up --build
```

O Compose sobe o banco, aplica as migrations, roda o seed e inicia a API, a interface web, o worker de integração e o simulador do sistema externo (`ext-mock`). Os valores padrão servem para uso local. Para trocá-los, copie `.env.example` para `.env` e edite.

> **Volume criado antes da integração externa?** O papel `app_worker` é criado só na primeira subida do banco. Se o volume já existia, recrie-o: `docker compose down --volumes && docker compose up --build`.

| Serviço                       | Endereço                                |
| ----------------------------- | --------------------------------------- |
| Aplicação web                 | http://localhost:3000                   |
| API                           | http://localhost:3001                   |
| Documentação da API (Swagger) | http://localhost:3001/api/docs          |
| PostgreSQL                    | `localhost:5432` (banco `solicitacoes`) |
| Sistema externo (simulador)   | http://127.0.0.1:4010/eventos           |

Para parar e apagar os dados: `docker compose down --volumes`.

### Variáveis de ambiente

Todas têm padrão local no `compose.yaml`; o `.env.example` traz os mesmos valores para o desenvolvimento fora do Docker.

| Variável                                                          | Padrão local                                          | Uso                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`, `APP_OWNER_PASSWORD`, `APP_RUNTIME_PASSWORD` | `postgres-local`, `owner-local`, `runtime-local`      | Senhas do superusuário e dos papéis do banco                                                           |
| `APP_WORKER_PASSWORD`                                             | `worker-local`                                        | Senha do papel `app_worker`, usado pelo worker de integração                                           |
| `DB_PORT`                                                         | `5432`                                                | Porta do Postgres no host                                                                              |
| `SEED_PASSWORD`                                                   | `Demo@2026`                                           | Senha dos usuários de demonstração (o seed cria com ela; o modo demonstração do login a preenche)      |
| `DEMO_MODE`                                                       | `true`                                                | Modo demonstração no login. Só `true` liga; qualquer outro valor (ou ausente, fora do compose) desliga |
| `JWT_SECRET`                                                      | `segredo-local-de-desenvolvimento-troque-em-producao` | Assinatura dos access tokens (HS256). Obrigatória, com 32+ caracteres; troque fora do ambiente local   |
| `ACCESS_TOKEN_TTL`                                                | `15m`                                                 | Validade do access token                                                                               |
| `REFRESH_TOKEN_DIAS`                                              | `7`                                                   | Validade de cada refresh token                                                                         |
| `REFRESH_GRACA_SEGUNDOS`                                          | `10`                                                  | Janela em que um refresh recém-trocado ainda é aceito (duas abas renovando juntas)                     |
| `COOKIE_SECURE`                                                   | `false`                                               | Marca os cookies de sessão como `Secure`. Use `true` só atrás de HTTPS                                 |
| `LOG_LEVEL`                                                       | `info`                                                | Nível dos logs da API e do worker                                                                      |
| `OUTBOX_INTERVALO_MS`                                             | `2000`                                                | Intervalo entre os ciclos do worker                                                                    |
| `OUTBOX_LOTE`                                                     | `10`                                                  | Eventos enviados por ciclo                                                                             |
| `OUTBOX_TIMEOUT_MS`                                               | `5000`                                                | Tempo máximo de cada envio ao sistema externo                                                          |
| `OUTBOX_BACKOFF_BASE_MS`, `OUTBOX_BACKOFF_MAX_MS`                 | `2000`, `60000`                                       | Backoff: base × 2^(tentativas − 1), até o teto, com jitter de ±20%. Em produção: 30 s e 2 h            |
| `OUTBOX_MAX_TENTATIVAS`                                           | `8`                                                   | Tentativas automáticas antes de `FALHOU`; a API mostra "tentativa N de M" com o mesmo valor            |
| `MOCK_FAILURE_RATE`                                               | `0.5`                                                 | Probabilidade (0 a 1) de o simulador responder 503                                                     |

### Usuários de demonstração

Criados pelo seed. A senha de todos é o valor de `SEED_PASSWORD` (padrão `Demo@2026`). Entre em http://localhost:3000/login com qualquer um deles, por exemplo `carla.mendes@demo.test` / `Demo@2026`.

Com `DEMO_MODE=true` (padrão no compose), o login mostra o card "Modo demonstração" com um usuário por cargo: Ana Souza (Solicitante), Carla Mendes (Analista) e Diego Alves (Administrador). O botão "Usar" preenche o e-mail e a senha e põe o foco em "Entrar"; o envio segue o login normal. Desligado, o card e a senha não vão para a página.

| Nome         | E-mail                 | Cargo         | Área             |
| ------------ | ---------------------- | ------------- | ---------------- |
| Ana Souza    | ana.souza@demo.test    | Solicitante   | Financeiro       |
| Bruno Lima   | bruno.lima@demo.test   | Solicitante   | Recursos Humanos |
| Camila Rocha | camila.rocha@demo.test | Solicitante   | Comercial        |
| Carla Mendes | carla.mendes@demo.test | Analista      | Tecnologia       |
| Rafael Costa | rafael.costa@demo.test | Analista      | Tecnologia       |
| Diego Alves  | diego.alves@demo.test  | Administrador | Tecnologia       |

### Integração com o sistema externo

Aprovar uma solicitação grava o evento `SolicitacaoAprovada` na tabela `outbox_eventos`, na mesma transação da aprovação; reabrir uma aprovada grava `SolicitacaoReaberta`. O worker entrega os eventos ao simulador com `Idempotency-Key` (id do evento) e `X-Correlation-Id` (o `requestId` da aprovação), em ordem por solicitação. Falhas transitórias (rede, tempo esgotado, 5xx, 408, 429) ganham nova tentativa com backoff; erros permanentes (outros 4xx) ou tentativas esgotadas deixam o evento em `FALHOU`, e o administrador pode reprocessá-lo no detalhe da solicitação.

Para ver funcionando (com `MOCK_FAILURE_RATE=0.5`, o padrão):

1. Entre como Carla (analista), inicie a análise de uma solicitação e aprove-a.
2. Acompanhe as tentativas no log do worker: `docker compose logs -f worker`. Cada linha traz `eventoId`, `tentativa`, `statusHttp`, `latenciaMs`, `resultado` e, nas falhas, `proximaTentativaEm`.
3. Confira o que o sistema externo recebeu, cada evento uma única vez: `curl 127.0.0.1:4010/eventos`.
4. O detalhe da solicitação mostra a integração como enviada.

Para ver uma falha definitiva e o reprocessamento: `MOCK_FAILURE_RATE=1 OUTBOX_MAX_TENTATIVAS=3 docker compose up -d worker ext-mock api`, aprove uma solicitação, espere o `FALHOU` e, com a taxa de volta a `0`, reprocesse como Diego (administrador).

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

O `pnpm dev` sobe a API (porta 3001), a web (porta 3000) e o simulador do sistema externo (porta 4010) com recarga automática. O worker roda à parte, depois de um build da API: `pnpm --filter api build && node apps/api/dist/worker.js`.

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
| `pnpm test:e2e`         | Jornadas E2E com Playwright contra o `docker compose` (requer o ambiente de pé)       |
| `pnpm contract:check`   | Regenera o `openapi.json` e os tipos do web e falha se mudarem                        |
| `pnpm verify`           | Tudo que a CI verifica: formatação, lint, tipos, testes, build, contrato e integração |
| `pnpm db:migrate`       | Aplica as migrations                                                                  |
| `pnpm db:seed`          | Cria as áreas e os usuários de demonstração                                           |
| `pnpm db:reset`         | Recria o banco do zero (apaga os dados)                                               |

### Testes E2E

As jornadas críticas rodam com Playwright (Chromium) contra o ambiente completo do `docker compose`, sem servidor próprio. Ficam em `apps/web/e2e`: criar uma solicitação (também num celular de 390px), analisar e aprovar com reflexo no dashboard, isolamento entre solicitantes (404 no link direto) e reabertura pelo Admin.

```bash
docker compose up --build --wait
pnpm --filter web exec playwright install chromium   # só na primeira vez
pnpm test:e2e
```

- O endereço padrão é `http://localhost:3000`; para outro, use `E2E_BASE_URL=http://host:porta pnpm test:e2e`. A senha dos usuários vem de `SEED_PASSWORD` (padrão `Demo@2026`).
- Cada usuário entra uma vez por execução (o login tem limite de 5 tentativas por minuto por e-mail), e cada jornada cria as próprias solicitações com título único: a suíte roda de novo sem recriar o banco.
- Relatório e traces: `pnpm --filter web exec playwright show-report` (o relatório HTML é gerado na CI ou com `--reporter=html`) e `pnpm --filter web exec playwright show-trace <arquivo>` para o trace de uma falha em `apps/web/test-results`.
- O E2E fica fora do `pnpm verify`, porque precisa do ambiente de pé, mas roda na CI no job do Docker, depois que o ambiente sobe. Na falha, a CI publica o relatório e os traces do Playwright.

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
│   │   │   ├── modules/      # módulos de negócio (auth, solicitacoes, integracoes: outbox e worker)
│   │   │   ├── openapi/      # geração do contrato
│   │   │   └── worker.ts     # worker da outbox (node dist/worker.js)
│   │   └── test/             # testes HTTP e de integração (integracao/)
│   ├── ext-mock/             # simulador do sistema externo (Node, sem framework)
│   └── web/                  # Next.js
│       ├── e2e/              # jornadas E2E (Playwright)
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
- **Três papéis no banco.** `app_owner` é dono do schema e roda migrations e seed. `app_runtime` é o único papel usado pela API: lê e grava solicitações e sessões, mas não apaga nada, não altera o histórico e não acessa a tabela de migrations; na outbox, grava eventos e lê só as colunas de status. `app_worker` é o do worker: lê e atualiza só a outbox.
- **Transactional Outbox.** O evento de integração nasce na mesma transação da mudança de status: se ela falhar, o evento não existe. O worker trava cada evento com `FOR UPDATE SKIP LOCKED`, então várias réplicas não enviam o mesmo evento. O healthcheck do worker lê o arquivo de heartbeat gravado no fim de cada ciclo.
- **Contexto do usuário no banco.** A API grava o usuário e o cargo com `set_config` local à transação; as funções `app.usuario_atual()` e `app.cargo_atual()` leem esse contexto e devolvem `NULL` fora dele.
- **Busca sem acento.** `app.sem_acento()` (extensão `unaccent`) com índice trigram (`pg_trgm`): buscar "solicitacao" encontra "Solicitação".
- **Histórico com hash encadeado.** Cada evento do histórico guarda o SHA-256 do evento anterior da mesma solicitação junto com o próprio conteúdo, calculado por um trigger `BEFORE INSERT` (quem insere não escolhe o valor). O Admin verifica a corrente inteira pelo card "Integridade do histórico" (`GET /api/v1/auditoria/integridade`), que aponta conteúdo alterado e evento apagado ou inserido no meio.
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
- **CI (GitHub Actions):** em todo PR e push na `main`, roda a validação completa (com o contrato OpenAPI), os testes de integração com Postgres real, sobe o ambiente Docker do zero, verifica a API e a web e roda as jornadas E2E com Playwright, e faz uma varredura de segredos.

Os hooks são instalados automaticamente pelo `pnpm install`.

## Limitações conhecidas

- **404 com status HTTP 200.** Uma solicitação inexistente ou invisível mostra a página de "não encontrada", mas a resposta HTTP sai com status 200 (e `noindex`). Como a página tem `loading.tsx`, o Next começa a enviar o esqueleto antes de a consulta terminar, e o status já foi enviado quando o `notFound()` acontece. Para o usuário não muda nada; para clientes que olham o status, o 404 real é o da API.
- **Auditoria do histórico.** A corrente de hashes detecta alteração e remoção no meio, mas não a remoção do último evento de uma solicitação, nem uma reescrita completa por quem recalcular todos os hashes. Em produção, a solução é ancorar periodicamente o hash mais recente de cada corrente (ou um hash de todas) fora do banco, num armazenamento imutável (WORM) ou log externo.
