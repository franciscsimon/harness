# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/docker-event-collector
COPY docker-event-collector/package.json ./
RUN npm install && npm install jiti

FROM node:22-slim
WORKDIR /app/docker-event-collector
COPY --from=deps /app/docker-event-collector/node_modules ./node_modules
COPY docker-event-collector/ .
EXPOSE 3338
ENV COLLECTOR_PORT=3338
CMD ["npx", "jiti", "server.ts"]
