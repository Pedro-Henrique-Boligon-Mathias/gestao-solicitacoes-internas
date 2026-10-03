# syntax=docker/dockerfile:1
# Build a partir da raiz do repositório: docker build -f apps/ext-mock/Dockerfile .

FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ext-mock/package.json apps/ext-mock/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "ext-mock..."
COPY tsconfig.base.json ./
COPY apps/ext-mock apps/ext-mock
RUN pnpm --filter ext-mock run build

# Sem dependências de produção: só o JavaScript compilado e o package.json (type: module)
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/ext-mock/package.json ./
COPY --from=build --chown=node:node /repo/apps/ext-mock/dist ./dist
USER node
EXPOSE 4010
CMD ["node", "dist/index.js"]
