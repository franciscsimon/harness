# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/harness-ui
COPY harness-ui/package.json harness-ui/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
# Install docker CLI and ssh client for docker exec/cp and Soft Serve SSH
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg openssh-client && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app/harness-ui
COPY --from=deps /app/harness-ui/node_modules ./node_modules
COPY harness-ui/ .
EXPOSE 3336
ENV PORT=3336
CMD ["npx", "jiti", "server.ts"]
