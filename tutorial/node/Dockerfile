FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "server.js"]
