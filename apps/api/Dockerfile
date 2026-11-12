# ==============================================================================
# Kumaran Chits — Production Multi-Stage Dockerfile (NestJS 12 + Prisma)
# Subsystem: Backend Modular Monolith API & Worker (apps/api/)
# Base Image: Node.js 24 LTS Alpine Linux + pnpm via Corepack
# Security: Non-root execution, frozen lockfile, minimal attack surface
# Build Context: Monorepo root (docker build -f apps/api/Dockerfile .)
# ==============================================================================

# -------------------------------------------------------------
# Stage 1: Base Alpine Environment & Package Manager Setup
# -------------------------------------------------------------
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# -------------------------------------------------------------
# Stage 2: Monorepo Workspace Dependencies Installation
# -------------------------------------------------------------
FROM base AS deps

WORKDIR /app

# Install native build tooling (required by bcrypt)
RUN apk add --no-cache python3 make g++

# Copy root monorepo manifests and all workspace package descriptors
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/

# Install locked workspace dependencies for api using pnpm-lock.yaml + overrides
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter api...

# -------------------------------------------------------------
# Stage 3: TypeScript Compilation & Standalone Production Deploy
# -------------------------------------------------------------
FROM deps AS builder

WORKDIR /app

COPY apps/api ./apps/api

# Generate Prisma Client and compile NestJS into apps/api/dist
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api run build

# Materialize non-symlinked production dependencies and regenerate Prisma Client into /prod/api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter api deploy --prod --legacy /prod/api \
  && cd /prod/api \
  && /app/apps/api/node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# -------------------------------------------------------------
# Stage 4: Minimal Production Runtime
# -------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

# Security & performance runtime configuration
ENV NODE_ENV=production
ENV PORT=3000
ENV UV_THREADPOOL_SIZE=16
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Install runtime dependencies for Prisma engine and pg_dump utilities
RUN apk add --no-cache openssl libc6-compat postgresql-client

# Copy production package descriptor, pruned node_modules, compiled dist, and Prisma schema
COPY --from=builder /prod/api/package.json ./
COPY --from=builder /prod/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

# Use non-root node user provided by the base alpine image
USER node

# Expose standard application port
EXPOSE 3000

# Health check using node's built-in http request (honors custom PORT such as 3002 for worker)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1));"

# Launch the NestJS backend
CMD ["node", "dist/main.js"]
