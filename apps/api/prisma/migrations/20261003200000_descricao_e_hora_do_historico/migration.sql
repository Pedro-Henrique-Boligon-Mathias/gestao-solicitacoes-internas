-- Hora do evento no histórico: clock_timestamp() é a hora real do INSERT. now() seria o início da
-- transação, e numa corrida (edição × início da análise) a linha do tempo poderia mostrar primeiro
-- o evento que foi gravado depois. Precisão de microssegundos para dois eventos gravados no mesmo
-- milissegundo não empatarem (o desempate por id seria aleatório).
ALTER TABLE "solicitacao_historico" ALTER COLUMN "criado_em" SET DEFAULT clock_timestamp(),
ALTER COLUMN "criado_em" SET DATA TYPE TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Escrito à mão: descrição com pelo menos 10 caracteres que não sejam espaço
-- ---------------------------------------------------------------------------
-- Continua gravada como foi digitada (até 5000 caracteres), mas só espaços, tabs e quebras de linha
-- não bastam.
ALTER TABLE "solicitacoes" DROP CONSTRAINT "chk_solicitacoes_descricao";
ALTER TABLE "solicitacoes" ADD CONSTRAINT "chk_solicitacoes_descricao"
  CHECK (char_length("descricao") <= 5000
         AND char_length(regexp_replace("descricao", '\s', '', 'g')) >= 10);
