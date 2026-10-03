-- CreateEnum
CREATE TYPE "cargo" AS ENUM ('SOLICITANTE', 'ANALISTA', 'ADMIN');

-- CreateEnum
CREATE TYPE "prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "status_solicitacao" AS ENUM ('ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "tipo_evento" AS ENUM ('CRIADA', 'EDITADA', 'ANALISE_INICIADA', 'APROVADA', 'REJEITADA', 'REABERTA', 'EXCLUIDA');

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "cargo" "cargo" NOT NULL,
    "area_id" UUID NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "revogada_em" TIMESTAMPTZ(3),
    "motivo_revogacao" VARCHAR(40),
    "ip" VARCHAR(45),
    "user_agent" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" SERIAL NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "descricao" TEXT NOT NULL,
    "prioridade" "prioridade" NOT NULL,
    "status" "status_solicitacao" NOT NULL DEFAULT 'ABERTA',
    "solicitante_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "analista_id" UUID,
    "data_solicitacao" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisao_comentario" TEXT,
    "decidido_em" TIMESTAMPTZ(3),
    "decidido_por_id" UUID,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao_historico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "solicitacao_id" UUID NOT NULL,
    "tipo" "tipo_evento" NOT NULL,
    "status_anterior" "status_solicitacao",
    "status_novo" "status_solicitacao",
    "comentario" TEXT,
    "autor_id" UUID NOT NULL,
    "dados" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacao_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "areas_nome_key" ON "areas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_area_id_idx" ON "usuarios"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refresh_hash_key" ON "sessoes"("refresh_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_familia_id_idx" ON "sessoes"("familia_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_codigo_key" ON "solicitacoes"("codigo");

-- CreateIndex
CREATE INDEX "solicitacoes_data_solicitacao_idx" ON "solicitacoes"("data_solicitacao" DESC);

-- CreateIndex
CREATE INDEX "solicitacoes_solicitante_id_data_solicitacao_idx" ON "solicitacoes"("solicitante_id", "data_solicitacao" DESC);

-- CreateIndex
CREATE INDEX "solicitacoes_status_data_solicitacao_idx" ON "solicitacoes"("status", "data_solicitacao");

-- CreateIndex
CREATE INDEX "solicitacoes_area_id_idx" ON "solicitacoes"("area_id");

-- CreateIndex
CREATE INDEX "solicitacoes_analista_id_idx" ON "solicitacoes"("analista_id");

-- CreateIndex
CREATE INDEX "solicitacoes_decidido_por_id_idx" ON "solicitacoes"("decidido_por_id");

-- CreateIndex
CREATE INDEX "solicitacao_historico_solicitacao_id_criado_em_idx" ON "solicitacao_historico"("solicitacao_id", "criado_em");

-- CreateIndex
CREATE INDEX "solicitacao_historico_autor_id_idx" ON "solicitacao_historico"("autor_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_analista_id_fkey" FOREIGN KEY ("analista_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_historico" ADD CONSTRAINT "solicitacao_historico_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_historico" ADD CONSTRAINT "solicitacao_historico_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Escrito à mão: o que o Prisma não representa no schema.prisma
-- ---------------------------------------------------------------------------

-- Integridade -----------------------------------------------------------------

-- E-mails sempre gravados em minúsculas: a unicidade não depende de maiúsculas
ALTER TABLE "usuarios" ADD CONSTRAINT "chk_usuarios_email_minusculo" CHECK ("email" = lower("email"));

ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_titulo"
  CHECK (char_length(btrim("titulo")) >= 5);

ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_descricao"
  CHECK (char_length("descricao") BETWEEN 10 AND 5000);

-- Decisão completa se, e somente se, o status for final
ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_decisao_completa" CHECK (
  ("status" IN ('APROVADA', 'REJEITADA'))
  = ("decidido_em" IS NOT NULL AND "decisao_comentario" IS NOT NULL AND "decidido_por_id" IS NOT NULL)
);

-- Em análise ou decidida exige analista responsável
ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_analista_definido"
  CHECK ("status" = 'ABERTA' OR "analista_id" IS NOT NULL);

-- Segregação de funções: ninguém analisa nem decide a própria solicitação
ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_segregacao" CHECK (
  ("analista_id" IS NULL OR "analista_id" <> "solicitante_id")
  AND ("decidido_por_id" IS NULL OR "decidido_por_id" <> "solicitante_id")
);

-- Decisão e reabertura registradas no histórico sempre têm comentário
ALTER TABLE "solicitacao_historico" ADD CONSTRAINT "chk_historico_comentario"
  CHECK ("tipo" NOT IN ('APROVADA', 'REJEITADA', 'REABERTA') OR "comentario" IS NOT NULL);

-- Contexto da transação (base da RLS) ------------------------------------------
-- A API grava o usuário e o cargo com set_config(..., true), que vale só para a transação.
-- Sem contexto, as funções devolvem NULL: na dúvida, o banco nega.
CREATE SCHEMA "app";

CREATE FUNCTION app.usuario_atual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.usuario_id', true), '')::uuid $$;

CREATE FUNCTION app.cargo_atual() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.cargo', true), '') $$;

-- Busca sem acento ------------------------------------------------------------
-- Extensões trusted: o dono do banco (app_owner) cria sem superusuário.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- unaccent() é STABLE e índices exigem função IMMUTABLE.
-- Fixar o dicionário torna seguro marcar o wrapper como IMMUTABLE.
CREATE FUNCTION app.sem_acento(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

CREATE INDEX "idx_solicitacoes_busca" ON "solicitacoes"
  USING gin (app.sem_acento(lower("titulo" || ' ' || "descricao")) public.gin_trgm_ops);

-- Permissões do papel da API (app_runtime): só o necessário, sem DELETE --------
GRANT SELECT ON "areas" TO app_runtime;
GRANT SELECT ON "usuarios" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "solicitacoes" TO app_runtime;
GRANT USAGE, SELECT ON SEQUENCE "solicitacoes_codigo_seq" TO app_runtime;
-- Histórico é append-only: sem UPDATE e sem DELETE
GRANT SELECT, INSERT ON "solicitacao_historico" TO app_runtime;
-- Sessões são revogadas, nunca apagadas
GRANT SELECT, INSERT, UPDATE ON "sessoes" TO app_runtime;

GRANT USAGE ON SCHEMA "app" TO app_runtime;
GRANT EXECUTE ON FUNCTION app.usuario_atual(), app.cargo_atual(), app.sem_acento(text) TO app_runtime;
