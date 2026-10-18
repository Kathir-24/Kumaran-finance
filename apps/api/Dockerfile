# ==============================================================================
# Kumaran Chits — Production Multi-Stage Dockerfile (NestJS 12 + Prisma)
# Base Image: Node.js 22 LTS Alpine
# Security: Non-root execution, minimal attack surface, stripped build tooling
# ==============================================================================

# -------------------------------------------------------------
# Stage 1: Build & Compilation
# -------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build configurations
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --omit=dev

# -------------------------------------------------------------
# Stage 2: Production Runtime
# -------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Security: Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies for Prisma engine
RUN apk add --no-cache openssl libc6-compat

# Copy package descriptors and pruned production node_modules
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Use non-root node user provided by the base alpine image
USER node

# Expose standard application port
EXPOSE 3000

# Health check using node's built-in http request
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1));"

# Launch the NestJS backend
CMD ["node", "dist/main.js"]
