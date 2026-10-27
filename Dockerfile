FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs match-agent.mjs local-agent.mjs ./
COPY --chown=node:node lib/ ./lib/
COPY --chown=node:node web/ ./web/
USER node
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "server.mjs"]
