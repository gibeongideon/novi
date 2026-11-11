# @novi/web: static SPA served by Caddy. Built from the monorepo root.
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter "@novi/web..." build

FROM caddy:2-alpine
COPY infra/images/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 8080
