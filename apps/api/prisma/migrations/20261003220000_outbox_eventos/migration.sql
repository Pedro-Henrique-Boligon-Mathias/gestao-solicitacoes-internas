-- CreateEnum
CREATE TYPE "status_outbox" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "outbox_eventos" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "agregado_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "status_outbox" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa_em" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "ultimo_erro" TEXT,
    "correlation_id" VARCHAR(100),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "enviado_em" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_eventos_status_proxima_tentativa_em_idx" ON "outbox_eventos"("status", "proxima_tentativa_em");

-- CreateIndex
CREATE INDEX "outbox_eventos_agregado_id_criado_em_idx" ON "outbox_eventos"("agregado_id", "criado_em");

-- AddForeignKey
ALTER TABLE "outbox_eventos" ADD CONSTRAINT "outbox_eventos_agregado_id_fkey" FOREIGN KEY ("agregado_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Escrito à mão: regras da outbox (ADR-010)
-- ---------------------------------------------------------------------------
-- Os dois tipos de evento do contrato; tentativas nunca negativas; enviado_em existe se, e só se,
-- o evento foi entregue.
ALTER TABLE "outbox_eventos" ADD CONSTRAINT "chk_outbox_eventos_tipo"
  CHECK ("tipo" IN ('SolicitacaoAprovada', 'SolicitacaoReaberta'));
ALTER TABLE "outbox_eventos" ADD CONSTRAINT "chk_outbox_eventos_tentativas"
  CHECK ("tentativas" >= 0);
ALTER TABLE "outbox_eventos" ADD CONSTRAINT "chk_outbox_eventos_enviado_em"
  CHECK (("enviado_em" IS NOT NULL) = ("status" = 'ENVIADO'));

-- ---------------------------------------------------------------------------
-- Escrito à mão: permissões (ADR-005)
-- ---------------------------------------------------------------------------
-- app_runtime (API): grava o evento junto com a mudança de status e lê só as colunas de status,
-- para mostrar a integração no detalhe. O conteúdo do evento (payload), o último erro e o
-- correlation id ficam só com o worker. O UPDATE serve ao reprocessamento pelo administrador.
-- Como não há SELECT em todas as colunas, a API insere sem RETURNING.
GRANT INSERT ON "outbox_eventos" TO app_runtime;
GRANT SELECT ("id", "tipo", "agregado_id", "status", "tentativas", "proxima_tentativa_em",
              "criado_em", "enviado_em") ON "outbox_eventos" TO app_runtime;
GRANT UPDATE ("status", "tentativas", "proxima_tentativa_em") ON "outbox_eventos" TO app_runtime;

-- app_worker: lê e atualiza a outbox, e nada mais. Não cria nem apaga eventos.
GRANT SELECT, UPDATE ON "outbox_eventos" TO app_worker;

-- ---------------------------------------------------------------------------
-- Escrito à mão: Row Level Security em outbox_eventos
-- ---------------------------------------------------------------------------
-- Sem FORCE: o dono (app_owner) continua fora da RLS, como nas outras tabelas.
ALTER TABLE "outbox_eventos" ENABLE ROW LEVEL SECURITY;

-- A outbox herda a visibilidade da solicitação, como o histórico
CREATE POLICY outbox_select ON "outbox_eventos" FOR SELECT TO app_runtime
  USING (EXISTS (SELECT 1 FROM "solicitacoes" s WHERE s."id" = "outbox_eventos"."agregado_id"));

-- Só quem decide (analista ou administrador) gera eventos: aprovação e reabertura
CREATE POLICY outbox_insert ON "outbox_eventos" FOR INSERT TO app_runtime
  WITH CHECK (app.cargo_atual() IN ('ANALISTA', 'ADMIN'));

-- Reprocessamento: só o administrador devolve um evento à fila
CREATE POLICY outbox_update ON "outbox_eventos" FOR UPDATE TO app_runtime
  USING (app.cargo_atual() = 'ADMIN')
  WITH CHECK (app.cargo_atual() = 'ADMIN');

-- O worker processa a fila inteira, sem contexto de usuário
CREATE POLICY outbox_worker ON "outbox_eventos" FOR ALL TO app_worker
  USING (true)
  WITH CHECK (true);
