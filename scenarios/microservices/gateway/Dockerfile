FROM node:20-buster-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

FROM node:20-buster-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/*.js ./
COPY --from=build /app/package.json ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
