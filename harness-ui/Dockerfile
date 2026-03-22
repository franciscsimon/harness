# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/harness-ui
COPY harness-ui/package.json harness-ui/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
WORKDIR /app/harness-ui
COPY --from=deps /app/harness-ui/node_modules ./node_modules
COPY harness-ui/ .
EXPOSE 3336
ENV PORT=3336
CMD ["npx", "jiti", "server.ts"]
