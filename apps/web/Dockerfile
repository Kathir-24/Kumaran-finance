# ==============================================================================
# Kumaran Chits — Production Multi-Stage Dockerfile (Next.js 15 Standalone)
# Subsystem: Web Operations Portal (apps/web/)
# Company: Kumaran Finance (Head Office: Perundurai, Erode, Tamil Nadu)
# Base Image: Node.js 22 LTS Alpine Linux + pnpm 12+ via Corepack
# Security: Non-root execution (UID 1001: nextjs), minimal runtime (~100 MB)
# ==============================================================================

# -------------------------------------------------------------
# Stage 1: Base Alpine Environment & Package Manager Setup
# -------------------------------------------------------------
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# -------------------------------------------------------------
# Stage 2: Monorepo Workspace Dependencies Installation
# -------------------------------------------------------------
FROM base AS deps

WORKDIR /app
RUN apk add --no-cache libc6-compat

# Copy root monorepo manifests and workspace package manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/web/package.json ./apps/web/

# Install dependencies using frozen lockfile
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------
# Stage 3: TypeScript Compilation & Next.js Standalone Build
# -------------------------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy cached dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy workspace source files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig*.json ./
COPY packages/api-client ./packages/api-client
COPY apps/web ./apps/web

# Build internal shared client SDK (@kumaran/api-client)
RUN pnpm --filter @kumaran/api-client build

# Build-time environment configuration
ENV BUILD_STANDALONE=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Public environment variables for client bundle compilation
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BULL_BOARD_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:3000}
ENV NEXT_PUBLIC_BULL_BOARD_URL=${NEXT_PUBLIC_BULL_BOARD_URL:-http://localhost:3000/admin/queues}

# Compile Next.js 15 with standalone output
RUN pnpm --filter web build

# -------------------------------------------------------------
# Stage 4: Minimal Production Runtime
# -------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Non-root unprivileged service account
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and traced standalone bundle
# In monorepos, Next.js standalone produces server.js in apps/web/
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3001

# Health check verifying HTTP status 200/307/308
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://127.0.0.1:3001', (res) => { process.exit(res.statusCode === 200 || res.statusCode === 307 || res.statusCode === 308 ? 0 : 1); }); req.on('error', () => process.exit(1));"

CMD ["node", "apps/web/server.js"]
