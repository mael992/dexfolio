FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY worker.mjs vision.mjs ./
USER node
CMD ["node", "worker.mjs"]
