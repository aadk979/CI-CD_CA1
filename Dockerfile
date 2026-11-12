# syntax=docker/dockerfile:1
# One image runs both roles:  web  → node dist/server.mjs (default)
#                              worker → node dist/worker.mjs

FROM node:25-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Install all dependencies (cached unless the lockfile changes) ──────────
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/load-env.ts ./src/lib/load-env.ts
RUN npm ci

# ── Build Next.js + bundle the custom server and worker ────────────────────
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ── Minimal runtime image ─────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
# Baked in by CI (git SHA) so /api/health can report exactly what is deployed.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src/lib/load-env.ts ./src/lib/load-env.ts

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
CMD ["node", "dist/server.mjs"]
