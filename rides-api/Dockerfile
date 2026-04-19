# ---- Build stage: install deps (including native modules) ----
FROM node:20-alpine AS deps

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs libstdc++
RUN apk add --no-cache libstdc++ curl

# Non-root user for security
RUN addgroup -S petcare && adduser -S petcare -G petcare

# Copy production deps from build stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Copy application source
COPY src/ ./src/
COPY public/ ./public/
COPY migrations/ ./migrations/

# Data directory — mount a volume here for persistence
RUN mkdir -p /app/src/data /app/db /app/uploads && chown -R petcare:petcare /app


ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

USER petcare
CMD ["node", "src/index.js"]
