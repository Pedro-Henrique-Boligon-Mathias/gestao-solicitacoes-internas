# Decisões técnicas

Registro curto das decisões de arquitetura (ADRs), no formato contexto, decisão e consequências. Quando uma decisão muda, a ADR não é apagada: ela registra o estado atual e o que valia antes.

| ADR                 | Decisão                                                         |
| ------------------- | --------------------------------------------------------------- |
| [ADR-001](#adr-001) | Monorepo pnpm + Turborepo, com OpenAPI como contrato            |
| [ADR-002](#adr-002) | NestJS modular com domínio isolado                              |
| [ADR-003](#adr-003) | Prisma como ORM e ferramenta de migrations                      |
| [ADR-004](#adr-004) | Autenticação própria via BFF, com refresh token rotativo        |
| [ADR-005](#adr-005) | Autorização em duas camadas: API e RLS                          |
| [ADR-006](#adr-006) | Mudança de status como comando explícito                        |
| [ADR-007](#adr-007) | Exclusão lógica e histórico append-only                         |
| [ADR-008](#adr-008) | Problem Details (RFC 9457) como formato de erro                 |
| [ADR-009](#adr-009) | Docker Compose como execução oficial, Kubernetes só documentado |
| [ADR-010](#adr-010) | Transactional Outbox para integração externa                    |
| [ADR-011](#adr-011) | Domínio em português, termos técnicos em inglês                 |
| [ADR-012](#adr-012) | Cache só para dados iguais para todos                           |
| [ADR-013](#adr-013) | Identidade visual própria: paleta Marinho                       |

## ADR-001

**Monorepo pnpm + Turborepo, com OpenAPI como contrato**

- **Contexto:** front e back precisam concordar sobre os dados trocados, e o contrato deve servir a outros consumidores (outro front, app, sistemas externos).
- **Decisão:** um repositório com `apps/web` e `apps/api`. O contrato é o OpenAPI, gerado a partir dos DTOs da API (code-first) e versionado em `apps/api/openapi.json`. O web usa tipos e client gerados com `openapi-typescript` e `openapi-fetch`. A CI regenera o spec e os tipos e falha se o que está commitado estiver desatualizado.
- **Alternativas descartadas:** um pacote compartilhado de schemas zod (só serve a consumidores TypeScript e cria uma segunda fonte de verdade ao lado do OpenAPI) e um spec escrito à mão (mais trabalho para manter alinhado ao código).
- **Consequências:** contrato independente de linguagem, e mudanças de API aparecem no diff. Os formulários do front têm validação própria só para a experiência do usuário. A API continua sendo a autoridade.

> [!NOTE]
> A primeira versão desta decisão usava o pacote de schemas zod compartilhado. Ele foi trocado pelo OpenAPI antes da implementação.

## ADR-002

**NestJS modular com domínio isolado (hexagonal leve)**

- **Contexto:** a regra de negócio (transições, permissões, segregação de funções, reabertura) é o centro do sistema e precisa ser fácil de testar.
- **Decisão:** módulos por feature. Em `solicitacoes`, as camadas `http`, `application`, `domain` e `infra`. O domínio é feito de funções puras, sem Nest nem Prisma. Um único serviço de API (monólito modular), sem microsserviços.
- **Alternativas descartadas:** um service "gordo" com Prisma direto (mistura regra e infraestrutura), DDD completo (cerimônia demais para o tamanho do sistema) e microsserviços (custo alto sem necessidade real).
- **Consequências:** testes de domínio rápidos e sem banco. Módulos simples continuam enxutos. Um módulo pode virar serviço separado no futuro, se houver motivo.

## ADR-003

**Prisma como ORM e ferramenta de migrations**

- **Contexto:** o projeto precisa de migrations versionadas, tipagem forte e uma ferramenta conhecida.
- **Decisão:** Prisma ORM e Prisma Migrate. CHECKs, RLS, permissões, extensões, funções, trigger e o índice de busca sem acento ficam em SQL escrito à mão dentro das migrations.
- **Alternativas descartadas:** TypeORM (tipagem mais fraca, sincronização automática perigosa) e Drizzle (bom para RLS e SQL, mas menos difundido).
- **Consequências:** boa produtividade. Parte do schema existe só no SQL, por isso está documentada em [modelo-de-dados.md](modelo-de-dados.md). A RLS exige uma transação por requisição. O Prisma não gera migration para desfazer os CHECKs e GRANTs escritos à mão (sem drift).

## ADR-004

**Autenticação própria via BFF: access token curto, refresh token rotativo e sessão persistente**

- **Contexto:** tudo precisa rodar localmente, com cargos. Os tokens não podem ficar expostos a XSS, e o usuário não deve ser deslogado a cada poucas horas.
- **Decisão:** a API emite um access token JWT de 15 minutos e um refresh token opaco de 7 dias, guardado só como hash na tabela `sessoes`. A cada uso, o refresh é trocado por um novo. Se um token já usado reaparecer, a família inteira de sessões é revogada. O Next guarda os dois em cookies httpOnly e renova o access token no `proxy.ts`. Logout e desativação do usuário revogam as sessões.
- **Alternativas descartadas:** provedor de identidade externo, como Auth0 (depende de serviço fora do ambiente local), Auth.js (camada extra) e token em `localStorage` (vulnerável a XSS).
- **Consequências:** sessão longa e revogável, com detecção de roubo de token. Renovações simultâneas precisam de um período de graça curto, configurado em `REFRESH_GRACA_SEGUNDOS`.

> [!NOTE]
> A primeira versão previa um JWT único de 8 horas, sem refresh nem revogação.

## ADR-005

**Autorização em duas camadas: API e RLS**

- **Contexto:** a visibilidade por dono é uma regra crítica. Um filtro esquecido vaza dados.
- **Decisão:** guards e políticas na API como camada principal, e Row Level Security no Postgres como defesa em profundidade. O contexto (usuário e cargo) chega ao banco por `set_config` local à transação. Cada processo usa um papel próprio no banco, com o mínimo de permissões.
- **Alternativas descartadas:** só na API (mais simples, mas um bug vaza dados) e só RLS (regras de ação ficariam no SQL, difíceis de testar e de explicar).
- **Consequências:** o isolamento é garantido também pelo banco. Há mais papéis para manter (`app_owner`, `app_runtime`, `app_worker`) e uma transação por requisição. Detalhes em [permissoes.md](permissoes.md) e [modelo-de-dados.md](modelo-de-dados.md#row-level-security).

## ADR-006

**Mudança de status como comando explícito**

- **Contexto:** iniciar análise, decidir e reabrir têm permissão própria, comentário obrigatório (na decisão e na reabertura) e efeitos colaterais.
- **Decisão:** `POST /solicitacoes/:id/analise`, `POST /solicitacoes/:id/decisao` e `POST /solicitacoes/:id/reabertura`. O `PATCH /solicitacoes/:id` não aceita `status`.
- **Alternativas descartadas:** um `PATCH { status }` genérico, com validação condicional confusa e auditoria mais difícil.
- **Consequências:** a API mostra a intenção de cada chamada, cada comando tem validação específica, e o UPDATE é condicional (versão e status esperados) para evitar corrida.

## ADR-007

**Exclusão lógica e histórico append-only**

- **Contexto:** o sistema precisa de rastreabilidade: quem fez o quê, quando e por quê.
- **Decisão:** `excluido_em` nas solicitações. O histórico não aceita UPDATE nem DELETE, garantido por GRANT. Numa reabertura, a decisão desfeita fica registrada no histórico.
- **Alternativas descartadas:** DELETE físico (perde a auditoria) e tabela de auditoria genérica por trigger (mais opaca).
- **Consequências:** as consultas filtram `excluido_em`. O volume cresce, e o particionamento fica como evolução.

> [!NOTE]
> O histórico também tem uma corrente de hash por solicitação, calculada por trigger. Ela detecta alterações feitas por quem tem acesso mais alto ao banco, e o administrador confere a integridade em `GET /auditoria/integridade`. Ver [modelo-de-dados.md](modelo-de-dados.md#hash-encadeado).

## ADR-008

**Problem Details (RFC 9457) como formato de erro**

- **Contexto:** o front precisa tratar erros de forma uniforme, e o suporte precisa achar o log de uma falha.
- **Decisão:** todos os erros saem como `application/problem+json`, com `code` estável para o front e `requestId` para achar o log. O `requestId` nasce num middleware, antes dos guards, para que até as requisições recusadas fiquem rastreáveis.
- **Consequências:** o front trata erros de forma genérica, e o suporte chega ao log a partir do `requestId`.

## ADR-009

**Docker Compose como execução oficial; Kubernetes só documentado**

- **Contexto:** o projeto precisa rodar sem atrito em qualquer máquina. Um cluster Kubernetes não traz ganho real para o tamanho atual do sistema.
- **Decisão:** `docker compose up --build` é o único caminho de execução. Ele sobe banco, migrations, API, worker, o mock do sistema externo e o web. O Kubernetes está descrito em [kubernetes.md](kubernetes.md) como evolução: deployments, probes, HPA, migrations em Job e banco gerenciado. Não há manifests no repositório.
- **Alternativas descartadas:** implementar os manifests (kind + Kustomize), que tiraria tempo do produto sem ganho para o uso atual.
- **Consequências:** execução simples e esforço concentrado no produto. O desenho de escalabilidade continua fundamentado, porque a API é stateless, tem probes e o worker suporta várias réplicas.

> [!NOTE]
> A primeira versão previa implementar os manifests de Kubernetes. A decisão foi revista, e hoje o Kubernetes existe só como documentação.

## ADR-010

**Transactional Outbox para integração externa**

- **Contexto:** depois da aprovação, é preciso avisar um sistema externo sem prender a experiência do usuário e sem perder eventos. A reabertura de uma solicitação aprovada também precisa ser comunicada.
- **Decisão:** a API grava os eventos `SolicitacaoAprovada` e `SolicitacaoReaberta` na tabela `outbox_eventos`, na mesma transação da mudança de status. Um worker separado envia com retry, backoff exponencial com jitter e idempotência (o `id` do evento é a chave). Esgotadas as tentativas, o evento fica como `FALHOU` e o administrador pode reprocessá-lo.
- **Alternativas descartadas:** chamar o sistema externo dentro da requisição (prende a experiência e pode aprovar sem avisar, ou avisar sem aprovar) e ir direto para um broker (mais infraestrutura, e ainda sofre de dual write).
- **Consequências:** entrega _at-least-once_, e o receptor precisa ser idempotente. Várias réplicas do worker podem rodar juntas graças ao `FOR UPDATE SKIP LOCKED`. Detalhes em [arquitetura.md](arquitetura.md) e [modelo-de-dados.md](modelo-de-dados.md#outbox_eventos).

## ADR-011

**Termos de domínio em português, termos técnicos em inglês**

- **Contexto:** o negócio fala em português, e "request" já tem outro sentido em HTTP.
- **Decisão:** nomes de domínio em português (`Solicitacao`, `prioridade`, `EM_ANALISE`, `acoesPermitidas`, `@Cargos()`, `@UsuarioAtual()`) ao lado de termos técnicos em inglês (`controller`, `repository`, `guard`).
- **Consequências:** o código usa a linguagem do negócio e não confunde `Request` (HTTP) com `Solicitacao` (domínio).

## ADR-012

**Cache só para dados iguais para todos os usuários**

- **Contexto:** o Next.js 16 tem APIs de cache e revalidação, mas com RLS cada usuário vê dados diferentes.
- **Decisão:** cachear apenas o que é igual para todos. Hoje isso é só a lista de áreas, buscada com `fetch` e `next: { tags: ['areas'], revalidate: 3600 }`. `GET /areas` é pública, e a chamada vai sem token nem cookie, para o cache servir a todos. Dashboard, listas e detalhes são sempre renderizados por requisição.
- **Alternativas descartadas:** cachear também as telas por usuário (ganho pequeno e risco de mostrar a solicitação de uma pessoa para outra) e usar `'use cache'`, que no Next 16 exige ligar `cacheComponents` e mudaria o modelo de renderização do app inteiro.
- **Consequências:** sem risco de vazamento entre usuários. O ganho de desempenho vem do Suspense com streaming, não de cache de dados sensíveis.

## ADR-013

**Identidade visual própria: paleta Marinho em grade de blocos**

- **Contexto:** o sistema precisa de uma identidade própria, sem imitar marca de terceiros, sóbria para uso diário e diferente do visual padrão de painel administrativo. Precisa de tema claro e escuro com contraste AA.
- **Decisão:** paleta Marinho, com `#14213D` como cor principal e `#FCA311` só em destaques sobre o marinho. Neutros puxados para o azul. Bricolage Grotesque em títulos e números, Instrument Sans no texto e JetBrains Mono em códigos e datas. Layout com menu lateral e cards em grade de blocos: um card de destaque marinho e blocos de status brancos com a cor do status nos detalhes. Tokens no padrão do shadcn/ui.
- **Alternativas descartadas:** outras paletas (Ardósia, Petróleo, Grafite) e uma variante de cards com o status numa faixa única. O laranja como cor principal foi descartado porque se confunde com "Em análise" e com prioridade Alta, e reprova no contraste com texto branco.
- **Consequências:** visual reconhecível e consistente entre as telas. O laranja exige disciplina: nunca vira botão comum nem texto sobre branco. No tema claro o gráfico usa marinho, e no escuro usa as cores de prioridade.
