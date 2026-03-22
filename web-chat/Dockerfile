# Build context: repo root (set in docker-compose.yml)
FROM node:22-slim AS deps
WORKDIR /app/web-chat
COPY web-chat/package.json web-chat/package-lock.json ./
RUN npm ci --ignore-scripts && npm install jiti

FROM node:22-slim
WORKDIR /app/web-chat
COPY --from=deps /app/web-chat/node_modules ./node_modules
COPY web-chat/ .
# Shared lib (web-chat imports ../lib/errors.ts)
COPY lib/errors.ts /app/lib/errors.ts
EXPOSE 3334
ENV PORT=3334
CMD ["npx", "jiti", "server.ts"]
