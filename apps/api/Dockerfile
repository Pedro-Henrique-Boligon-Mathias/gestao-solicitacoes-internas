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
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "api..."
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter api run generate \
 && pnpm --filter "api..." run build \
 && pnpm --filter api deploy --legacy --prod /prod/api

# Roda migrations + seed e encerra (usa o CLI do Prisma, que é dependência de desenvolvimento)
FROM build AS migrate
WORKDIR /repo/apps/api
ENV PATH=/repo/apps/api/node_modules/.bin:$PATH
USER node
CMD ["sh", "-c", "prisma migrate deploy && prisma db seed"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
