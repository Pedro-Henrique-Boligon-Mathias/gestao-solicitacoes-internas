-- Auditoria do histórico com hash encadeado (RN-10, doc 16).
-- O app_runtime já não altera nem apaga o histórico (só SELECT e INSERT). A corrente acrescenta
-- detecção: uma alteração ou remoção no meio, feita por quem tem acesso mais alto ao banco, deixa
-- de conferir com o recálculo do GET /auditoria/integridade.

-- AlterTable: nullable primeiro; NOT NULL só depois do preenchimento dos eventos existentes
ALTER TABLE "solicitacao_historico" ADD COLUMN "hash_anterior" CHAR(64),
ADD COLUMN "hash" CHAR(64);

-- ---------------------------------------------------------------------------
-- Escrito à mão: cálculo do hash (trigger BEFORE INSERT)
-- ---------------------------------------------------------------------------
-- Uma corrente por solicitação: hash_anterior = hash do último evento da mesma solicitação, na
-- ordem (criado_em, id); o primeiro evento parte da semente fixa (64 zeros).
--   hash = sha256(hash_anterior || '|' || conteúdo canônico), em hexadecimal minúsculo.
-- Conteúdo canônico: campos na ordem abaixo, separados por '|', NULL como texto vazio:
--   solicitacao_id | tipo | status_anterior | status_novo | autor_id | comentario | dados
--   | criado_em
-- `dados` (jsonb, dados da edição) entra como dados::text (a forma textual normalizada do jsonb),
-- antes de criado_em. criado_em vai em UTC com microssegundos: YYYY-MM-DDTHH24:MI:SS.USZ.
-- Quem insere não escolhe o valor: o trigger sobrescreve hash_anterior e hash informados.
CREATE FUNCTION app.conteudo_canonico_historico(h "solicitacao_historico") RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT h.solicitacao_id::text
      || '|' || h.tipo::text
      || '|' || coalesce(h.status_anterior::text, '')
      || '|' || coalesce(h.status_novo::text, '')
      || '|' || h.autor_id::text
      || '|' || coalesce(h.comentario, '')
      || '|' || coalesce(h.dados::text, '')
      || '|' || to_char(h.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  $$;

CREATE FUNCTION app.hash_do_evento(hash_anterior text, conteudo text) RETURNS char(64)
  LANGUAGE sql STABLE STRICT
  SET search_path = pg_catalog, public
  AS $$ SELECT encode(sha256(convert_to(hash_anterior || '|' || conteudo, 'UTF8')), 'hex') $$;

-- SECURITY DEFINER (dono app_owner, fora da RLS): o evento anterior é lido independentemente da
-- visibilidade de quem insere. VOLATILE: num INSERT de várias linhas (o seed), cada linha precisa
-- enxergar as anteriores do mesmo comando. search_path fixo contra sequestro de nomes.
CREATE FUNCTION app.encadear_historico() RETURNS trigger
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    SELECT h.hash INTO NEW.hash_anterior
      FROM public.solicitacao_historico h
     WHERE h.solicitacao_id = NEW.solicitacao_id
     ORDER BY h.criado_em DESC, h.id DESC
     LIMIT 1;
    NEW.hash_anterior := coalesce(NEW.hash_anterior, repeat('0', 64));
    NEW.hash := app.hash_do_evento(NEW.hash_anterior, app.conteudo_canonico_historico(NEW));
    RETURN NEW;
  END
  $$;

ALTER FUNCTION app.encadear_historico() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app.encadear_historico() FROM PUBLIC;

-- Preenchimento dos eventos existentes, corrente a corrente, na ordem (criado_em, id)
DO $$
DECLARE
  evento "solicitacao_historico";
  atual uuid;
  anterior text;
BEGIN
  FOR evento IN
    SELECT * FROM "solicitacao_historico" ORDER BY "solicitacao_id", "criado_em", "id"
  LOOP
    IF atual IS DISTINCT FROM evento.solicitacao_id THEN
      atual := evento.solicitacao_id;
      anterior := repeat('0', 64);
    END IF;
    evento.hash_anterior := anterior;
    evento.hash := app.hash_do_evento(anterior, app.conteudo_canonico_historico(evento));
    UPDATE "solicitacao_historico"
       SET "hash_anterior" = evento.hash_anterior, "hash" = evento.hash
     WHERE "id" = evento.id;
    anterior := evento.hash;
  END LOOP;
END
$$;

-- O default (a semente) só existe para o Prisma não exigir os campos no create: o trigger sempre
-- sobrescreve os dois valores.
ALTER TABLE "solicitacao_historico"
  ALTER COLUMN "hash_anterior" SET DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  ALTER COLUMN "hash_anterior" SET NOT NULL,
  ALTER COLUMN "hash" SET DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  ALTER COLUMN "hash" SET NOT NULL;

CREATE TRIGGER encadear_historico
  BEFORE INSERT ON "solicitacao_historico"
  FOR EACH ROW EXECUTE FUNCTION app.encadear_historico();

-- ---------------------------------------------------------------------------
-- Escrito à mão: permissões (ADR-005)
-- ---------------------------------------------------------------------------
-- O app_runtime continua só com SELECT e INSERT no histórico (nenhum GRANT novo na tabela). Ele
-- executa as funções do conteúdo canônico e do hash para recalcular a corrente na verificação.
GRANT EXECUTE ON FUNCTION app.conteudo_canonico_historico("solicitacao_historico"),
  app.hash_do_evento(text, text) TO app_runtime;
