# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/xtdb-ops-api
COPY xtdb-ops-api/package.json xtdb-ops-api/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
# Install docker CLI for health checks (exec into other containers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app/xtdb-ops-api
COPY --from=deps /app/xtdb-ops-api/node_modules ./node_modules
COPY xtdb-ops-api/ .
EXPOSE 3335
ENV OPS_PORT=3335
CMD ["npx", "jiti", "server.ts"]
