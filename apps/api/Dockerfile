# syntax=docker/dockerfile:1
# Build a partir da raiz do repositório: docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "api..."
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter api run generate \
 && pnpm --filter api run build

# Cada imagem recebe só as dependências que usa (ver docker/manifesto-imagem.mjs).
# auto-install-peers=false: o CLI do Prisma é peer do client, mas não roda na API.
# Do runtime do Prisma ficam só os arquivos do Postgres (sem source maps nem os outros bancos).
FROM build AS deploy
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    cp apps/api/package.json /tmp/package.json \
 && node apps/api/docker/manifesto-imagem.mjs runtime \
 && pnpm --filter api deploy --legacy --prod --offline --config.auto-install-peers=false /prod/api \
 && cp /tmp/package.json apps/api/package.json \
 && node apps/api/docker/manifesto-imagem.mjs migrate \
 && pnpm --filter api deploy --legacy --prod --offline --config.auto-install-peers=false /prod/migrate \
 && find /prod -path '*/@prisma/client/runtime/*' -type f \
      \( -name '*.map' -o \( -name 'query_compiler_*' ! -name '*postgresql*' \) \) -delete

# Node sem npm, yarn e corepack, que as imagens finais não usam. O FROM scratch achata a imagem
# numa camada só; sem isso, apagar arquivos da imagem base não reduziria o tamanho.
FROM node:24-alpine AS node-sem-gerenciadores
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

FROM scratch AS node
COPY --from=node-sem-gerenciadores / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Roda migrations + seed e encerra (CLI do Prisma e tsx, sem o restante das ferramentas de dev)
FROM node AS migrate
ENV PATH=/app/node_modules/.bin:$PATH
WORKDIR /app
COPY --from=deploy --chown=node:node /prod/migrate ./
USER node
CMD ["sh", "-c", "prisma migrate deploy && prisma db seed"]

FROM node AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy --chown=node:node /prod/api ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
