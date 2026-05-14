# syntax=docker/dockerfile:1.4
## VibeSDK Production-like Container
## Multi-stage build with BuildKit layer caching for faster rebuilds.
##
## Usage:
##   DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t vibesdk .
##   docker run -p 3000:3000 vibesdk
##
## BuildKit cache mounts prevent re-downloading packages on source-only changes
## (mirrors the Cursor 70% build-speed improvement shipped May 2026).

FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install system dependencies.
# --mount=type=cache persists the apk cache across builds so unchanged
# package sets are served from disk, not re-fetched from the network.
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    apk add --no-cache git curl bash nodejs npm python3 make g++

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Copy package manifests first — changes here invalidate the install cache
# but NOT the apk layer above.
COPY package.json bun.lock ./
COPY sdk/package.json sdk/
COPY container/package.json container/

# --mount=type=cache persists bun's install cache (~/.bun/install/cache)
# between builds.  When package.json/bun.lock haven't changed, bun resolves
# all packages from the local cache instead of the network (major speedup).
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile

# ============================================
# Development stage
# ============================================
FROM base AS dev

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/sdk/node_modules ./sdk/node_modules
COPY --from=deps /app/container/node_modules ./container/node_modules

# Copy source code
COPY . .

# Expose ports
EXPOSE 3000 8787

# Environment
ENV NODE_ENV=development
ENV DEV_MODE=true

# Start development server
CMD ["bun", "run", "dev"]

# ============================================
# Builder stage
# ============================================
FROM base AS builder

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/sdk/node_modules ./sdk/node_modules
COPY --from=deps /app/container/node_modules ./container/node_modules

# Copy source
COPY . .

# Build the application
RUN bun run build

# ============================================
# Production stage
# ============================================
FROM base AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/wrangler.local.jsonc ./
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 3000

ENV NODE_ENV=production

# Use wrangler to serve (simulates Workers environment)
CMD ["bunx", "wrangler", "dev", "--config", "wrangler.local.jsonc", "--port", "3000", "--local"]
