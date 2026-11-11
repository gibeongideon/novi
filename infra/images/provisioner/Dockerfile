# @novi/provisioner. Built from the monorepo root: docker build -f infra/images/provisioner/Dockerfile .
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@novi/provisioner..." build \
 && pnpm --filter @novi/provisioner deploy --prod /out

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node

CMD ["node", "dist/index.js"]
