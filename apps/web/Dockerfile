# syntax=docker/dockerfile:1
# SongNoi web image. Build from the repo root:  docker build -f apps/web/Dockerfile .

ARG NODE_IMAGE=node:24-alpine

# ── Build the app and its workspace packages ────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
# Scripts are skipped (no git hooks in an image); the Prisma client is generated explicitly.
# Behind a TLS-intercepting proxy, pass its CA: docker build --secret id=ca,src=/path/ca.pem
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
 && pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm --filter @songnoi/web exec prisma generate \
 && pnpm turbo run build --filter=@songnoi/web

# ── Prisma CLI for `migrate deploy` at start-up (not part of Next's standalone output) ──
FROM ${NODE_IMAGE} AS migrator
ENV CHECKPOINT_DISABLE=1
WORKDIR /migrate
COPY --from=build /repo/apps/web/package.json /tmp/web-package.json
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
 && PRISMA_VERSION="$(node -p "require('/tmp/web-package.json').devDependencies.prisma")" \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev "prisma@${PRISMA_VERSION}"

# ── Runtime ──────────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=migrator --chown=node:node /migrate/node_modules ./migrate/node_modules
COPY --chown=node:node apps/web/prisma ./migrate/prisma
COPY --chown=node:node apps/web/prisma.config.ts apps/web/load-root-env.ts ./migrate/
COPY --chown=node:node apps/web/docker-entrypoint.sh /usr/local/bin/songnoi-entrypoint

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/usr/local/bin/songnoi-entrypoint"]
