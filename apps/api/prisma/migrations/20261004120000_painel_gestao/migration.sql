-- AlterTable
ALTER TABLE "outbox_eventos" ADD COLUMN "ultima_tentativa_em" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "solicitacao_historico_tipo_criado_em_idx" ON "solicitacao_historico"("tipo", "criado_em");

-- ---------------------------------------------------------------------------
-- Escrito à mão: permissões (ADR-005)
-- ---------------------------------------------------------------------------
-- app_runtime passa a ler o último erro e a hora da última tentativa, para o bloco de integrações
-- com falha do painel de gestão. A RLS da outbox não muda: cada pessoa continua vendo a integração
-- das solicitações que já pode ver. Só o endpoint do painel (restrito ao administrador) seleciona
-- ultimo_erro. O app_worker já lê e atualiza a tabela inteira.
GRANT SELECT ("ultimo_erro", "ultima_tentativa_em") ON "outbox_eventos" TO app_runtime;
