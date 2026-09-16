# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# corepack picks the pnpm version pinned by the root `packageManager` field, so the
# lockfile and the installer always agree under --frozen-lockfile.
RUN corepack enable

# Manifests only, so the install layer caches across source changes. web depends on
# the workspace packages (@sprint/ui, @sprint/types, @sprint/tokens) — their
# package.json files must be present or the workspace:* links cannot resolve.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

# Installed workspace (node_modules + manifests), the turbo task graph, then sources.
COPY --from=deps /app/ ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY web/ ./web/

ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# turbo's build task declares dependsOn ["^build"], so @sprint/types, @sprint/ui and
# @sprint/tokens compile first. They ship no dist/ in git but resolve to
# dist/index.js, so building them is required, not an optimization.
RUN pnpm turbo build --filter=@sprint/web

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next traces `output: 'standalone'` from the workspace root, so the bundle is
# monorepo-shaped: server.js sits under web/ with node_modules hoisted alongside it.
# static/ and public/ have to land next to that server.js, not at the image root.
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "web/server.js"]
