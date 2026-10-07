FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @prisma-prim/api...
COPY apps/api apps/api
RUN pnpm --filter @prisma-prim/api build

FROM node:24.19.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Keep the locked Drizzle CLI dependencies for the existing pre-deploy command.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build --chown=node:node /app/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
COPY --chown=node:node scripts/railway-api.mjs scripts/railway-config.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "scripts/railway-api.mjs", "start"]
