FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY server ./server
COPY vendor ./vendor
RUN node scripts/build.mjs && mkdir -p /app/data && chown -R node:node /app/data
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
