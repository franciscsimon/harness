# Build context: repo root (set in docker-compose.yml)
# CI runner needs docker CLI to spawn sibling containers
FROM node:22-slim AS deps
WORKDIR /app/ci-runner
COPY ci-runner/package.json ci-runner/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
# Install docker CLI (for building/running sibling containers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg ssh git && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/ci-runner
COPY --from=deps /app/ci-runner/node_modules ./node_modules
COPY ci-runner/ .
# Shared lib (ci-runner imports ../lib/jsonld/context.ts)
COPY lib/jsonld/ /app/lib/jsonld/
EXPOSE 3337
ENV PORT=3337
# Queue directory for CI jobs
RUN mkdir -p /app/ci-queue
ENV CI_QUEUE_DIR=/app/ci-queue
CMD ["npx", "jiti", "server.ts"]
