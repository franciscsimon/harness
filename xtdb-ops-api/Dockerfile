# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/xtdb-ops-api
COPY xtdb-ops-api/package.json xtdb-ops-api/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
WORKDIR /app/xtdb-ops-api
COPY --from=deps /app/xtdb-ops-api/node_modules ./node_modules
COPY xtdb-ops-api/ .
EXPOSE 3335
ENV OPS_PORT=3335
CMD ["npx", "jiti", "server.ts"]
