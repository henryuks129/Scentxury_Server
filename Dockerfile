# ============================================
# Scentxury Backend - Multi-Stage Dockerfile
# ============================================
# 
# Optimized for production with:
# - Multi-stage builds for minimal image size
# - Non-root user for security
# - Health checks
# - Build metadata labels
#
# Usage:
#   docker build -t scentxury-api:latest .
#   docker run -p 5000:5000 scentxury-api:latest
#
# ============================================

# Build arguments
ARG NODE_VERSION=20
ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# ============================================
# Base Stage - Common dependencies
# ============================================
FROM node:${NODE_VERSION}-alpine AS base

# Install dependencies needed for native modules (sharp, bcrypt)
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# ============================================
# Dependencies Stage - Install all deps
# ============================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
# Use --legacy-peer-deps for compatibility across npm versions
RUN npm install --prefer-offline --legacy-peer-deps && \
    npm cache clean --force

# ============================================
# Builder Stage - Compile TypeScript
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production && \
    npm cache clean --force

# ============================================
# Production Stage - Final image
# ============================================
FROM node:${NODE_VERSION}-alpine AS production

# Labels for container metadata
LABEL org.opencontainers.image.title="Scentxury API"
LABEL org.opencontainers.image.description="Premium Fragrance E-commerce Backend"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.vendor="Chi Fragrance"
LABEL org.opencontainers.image.source="https://github.com/chi-fragrance/scentxury-backend"
LABEL org.opencontainers.image.licenses="ISC"

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs scentxury && \
    chown -R scentxury:nodejs /app

# Copy only necessary files from builder
COPY --from=builder --chown=scentxury:nodejs /app/dist ./dist
COPY --from=builder --chown=scentxury:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=scentxury:nodejs /app/package*.json ./

# Switch to non-root user
USER scentxury

# Expose application port
EXPOSE 5000

# Health check - verify API is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/health/live', (r) => { console.log('Health:', r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "dist/server.js"]

# ============================================
# Development Stage - For local development
# ============================================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development
ENV PORT=5000

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs scentxury && \
    chown -R scentxury:nodejs /app

USER scentxury

EXPOSE 5000

# Start with hot-reload using tsx
CMD ["npx", "tsx", "watch", "src/server.ts"]

# ============================================
# Test Stage - For CI testing
# ============================================
FROM base AS test

WORKDIR /app

ENV NODE_ENV=test
ENV CI=true

COPY package*.json ./
RUN npm ci

COPY . .

# Run tests
CMD ["npm", "run", "test:ci"]
