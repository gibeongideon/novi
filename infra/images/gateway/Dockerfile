# @novi/gateway. Built from the monorepo root: docker build -f infra/images/gateway/Dockerfile .
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@novi/gateway..." build \
 && pnpm --filter @novi/gateway deploy --prod /out

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
