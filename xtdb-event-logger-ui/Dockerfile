# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/xtdb-event-logger-ui
COPY xtdb-event-logger-ui/package.json xtdb-event-logger-ui/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
WORKDIR /app/xtdb-event-logger-ui
COPY --from=deps /app/xtdb-event-logger-ui/node_modules ./node_modules
COPY xtdb-event-logger-ui/ .
EXPOSE 3333
ENV UI_PORT=3333
CMD ["npx", "jiti", "server.ts"]
