## VibeSDK Production-like Container
## Multi-stage build for optimized image size
## 
## Usage:
##   docker build -f docker/Dockerfile -t vibesdk .
##   docker run -p 3000:3000 vibesdk

FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git curl bash nodejs npm python3 make g++

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Copy package files
COPY package.json bun.lock ./
COPY sdk/package.json sdk/
COPY container/package.json container/

# Install dependencies
RUN bun install --frozen-lockfile

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
