FROM public.ecr.aws/docker/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /app
RUN npm install --global pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @prisma-prim/web...
COPY apps/web apps/web
COPY scripts/railway-web-config.mjs scripts/railway-config.mjs ./scripts/
# These are public browser settings. No secret is accepted as a build argument.
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
RUN node scripts/railway-web-config.mjs && pnpm --filter @prisma-prim/web build

FROM public.ecr.aws/docker/library/nginx:1.28.0-alpine@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284 AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/railway/nginx.conf.template /etc/nginx/prisma.conf.template
COPY deploy/railway/web-start.sh /usr/local/bin/prisma-web-start
USER nginx
EXPOSE 8080
ENTRYPOINT ["/bin/sh", "/usr/local/bin/prisma-web-start"]
