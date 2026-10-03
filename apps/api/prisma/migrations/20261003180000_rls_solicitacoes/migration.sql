-- ---------------------------------------------------------------------------
-- Escrito à mão: Row Level Security em solicitacoes e solicitacao_historico
-- ---------------------------------------------------------------------------
-- Segunda barreira de visibilidade (a primeira é o filtro do repositório na API). O contexto vem de
-- app.usuario_atual() e app.cargo_atual(), gravados com set_config(..., true) em cada transação.
-- Sem contexto, as políticas dão falso e nenhuma linha aparece: na dúvida, o banco nega.
--
-- Sem FORCE: o dono das tabelas (app_owner, que roda migrations e seed) continua fora da RLS.
-- O filtro excluido_em IS NULL fica no repositório, não aqui: em UPDATE ... RETURNING a linha nova
-- também precisa passar pela política de SELECT, e a exclusão lógica deixaria de funcionar.

ALTER TABLE "solicitacoes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY solicitacoes_select ON "solicitacoes" FOR SELECT TO app_runtime
  USING (app.cargo_atual() IN ('ANALISTA', 'ADMIN') OR "solicitante_id" = app.usuario_atual());

CREATE POLICY solicitacoes_insert ON "solicitacoes" FOR INSERT TO app_runtime
  WITH CHECK ("solicitante_id" = app.usuario_atual() AND "status" = 'ABERTA');

-- O solicitante só altera a própria enquanto ABERTA, e a linha continua ABERTA depois da alteração
CREATE POLICY solicitacoes_update ON "solicitacoes" FOR UPDATE TO app_runtime
  USING      (app.cargo_atual() IN ('ANALISTA', 'ADMIN')
              OR ("solicitante_id" = app.usuario_atual() AND "status" = 'ABERTA'))
  WITH CHECK (app.cargo_atual() IN ('ANALISTA', 'ADMIN')
              OR ("solicitante_id" = app.usuario_atual() AND "status" = 'ABERTA'));

-- Sem política de DELETE: a exclusão é lógica (UPDATE em excluido_em), e o GRANT não inclui DELETE.

ALTER TABLE "solicitacao_historico" ENABLE ROW LEVEL SECURITY;

-- O histórico herda a visibilidade da solicitação (a RLS da tabela-mãe vale dentro da subconsulta)
CREATE POLICY historico_select ON "solicitacao_historico" FOR SELECT TO app_runtime
  USING (EXISTS (SELECT 1 FROM "solicitacoes" s WHERE s."id" = "solicitacao_historico"."solicitacao_id"));

-- Cada um registra eventos só em nome próprio
CREATE POLICY historico_insert ON "solicitacao_historico" FOR INSERT TO app_runtime
  WITH CHECK ("autor_id" = app.usuario_atual());
