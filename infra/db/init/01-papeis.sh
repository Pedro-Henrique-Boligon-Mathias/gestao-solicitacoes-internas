#!/bin/sh
# Roda uma única vez, na primeira subida do container (volume vazio).
# app_owner: dono do schema; usado pelas migrations e pelo seed. O CREATEDB serve ao banco
#            temporário (shadow database) que o `prisma migrate dev` cria em desenvolvimento.
# app_runtime: usado pela API; sem privilégios de administração e sem bypass de RLS.
# app_worker: usado pelo worker da outbox; as migrations liberam só a tabela outbox_eventos.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v banco="$POSTGRES_DB" \
  -v senha_owner="$APP_OWNER_PASSWORD" \
  -v senha_runtime="$APP_RUNTIME_PASSWORD" \
  -v senha_worker="$APP_WORKER_PASSWORD" <<'SQL'
CREATE ROLE app_owner LOGIN CREATEDB PASSWORD :'senha_owner';
CREATE ROLE app_runtime LOGIN PASSWORD :'senha_runtime'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE app_worker LOGIN PASSWORD :'senha_worker'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- O dono do banco também é dono do schema public (pg_database_owner, Postgres 15+)
ALTER DATABASE :"banco" OWNER TO app_owner;

REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO app_owner, app_runtime, app_worker;
GRANT USAGE ON SCHEMA public TO app_runtime, app_worker;
SQL
