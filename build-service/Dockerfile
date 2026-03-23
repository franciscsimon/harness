FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssh-client gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
     > /etc/apt/sources.list.d/docker.list \
  && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY build-service/package.json ./build-service/
RUN cd build-service && npm install --ignore-scripts
COPY lib/ ./lib/
COPY build-service/ ./build-service/
WORKDIR /app/build-service
EXPOSE 3339
CMD ["npm", "start"]
