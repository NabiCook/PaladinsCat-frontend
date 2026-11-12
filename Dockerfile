# Frontend — Next.js app
# Usage: docker build --build-context frontend-images=../paladinscat-frontend-images -t paladinscat-frontend .
#   MODE=prod (default): build + optimized runtime
#   MODE=dev: dev server with hot reload

ARG MODE=prod

# Pinned private resource assembly; no repository credentials enter this context.
FROM node:22-alpine AS resources
WORKDIR /app
COPY frontend-images.lock.json ./
COPY scripts/prepare-frontend-images.mjs ./scripts/
RUN --mount=type=bind,from=frontend-images,target=/frontend-images,ro \
    node scripts/prepare-frontend-images.mjs --source /frontend-images

# Install stage (Node 22 — undici@8.12.3 requires node>=22.19.0; Node 20 trips
# EBADENGINE and npm dies with "Exit handler never called!", leaving a broken
# node_modules that the build stage then fails to resolve.)
FROM node:22-alpine AS builder-install
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY vendor ./vendor
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund

# Build stage (Node 22 for --experimental-strip-types in prebuild)
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_SERVER_API_URL=http://backend-rust-api:3005
ARG NEXT_BUILD_CPUS=2
ARG NEXT_PUBLIC_LOCALE_BASE_URL=/locales
ARG NEXT_PUBLIC_IDENTITY_CUTOVER_ENABLED=false
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_SERVER_API_URL=${NEXT_SERVER_API_URL}
ENV NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS}
ENV NEXT_PUBLIC_LOCALE_BASE_URL=${NEXT_PUBLIC_LOCALE_BASE_URL}
ENV NEXT_PUBLIC_IDENTITY_CUTOVER_ENABLED=${NEXT_PUBLIC_IDENTITY_CUTOVER_ENABLED}
COPY --from=builder-install /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY vendor ./vendor
COPY locales /locales
ENV PALADINSCAT_LOCALES_REPO=/locales
COPY . .
COPY --from=resources /app/public/ ./public/
RUN --mount=type=cache,id=npm-cache,target=/root/.npm --mount=type=bind,from=frontend-images,target=/frontend-images,ro \
    PALADINSCAT_FRONTEND_IMAGES_ROOT=/frontend-images npm run build

# Dev stage
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json ./
COPY vendor ./vendor
RUN npm install
COPY locales /locales
ENV PALADINSCAT_LOCALES_REPO=/locales
COPY . ./
COPY --from=frontend-images /manifest.json /frontend-images/manifest.json
COPY --from=frontend-images /frontend/ /frontend-images/frontend/
ENV PALADINSCAT_FRONTEND_IMAGES_ROOT=/frontend-images
CMD ["sh", "-c", "npm install && npm run dev -- -H 0.0.0.0"]

# Prod runtime
FROM node:22-alpine AS runtime
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/operator-server.mjs ./operator-server.mjs
COPY --chown=node:node --from=builder /app/lib/operator-plane.ts ./lib/operator-plane.ts
COPY --chown=node:node --from=builder /app/lib/operator-transport.mjs ./lib/operator-transport.mjs
COPY --chown=node:node --from=builder /app/lib/operator-server-core.mjs ./lib/operator-server-core.mjs
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]

# Select final stage based on MODE
FROM dev AS dev-final
FROM runtime AS prod-final
FROM ${MODE}-final
