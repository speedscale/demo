# syntax=docker/dockerfile:1.7
################################################################################
# BUILDER IMAGE
################################################################################
FROM node:20-buster-slim AS build

ENV NPM_CONFIG_USERCONFIG=/tmp/empty-npmrc
WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
 && npm config delete '//npm.pkg.github.com/:_authToken' || true \
 && npm config list \
 && npm ci --no-audit --fund=false

COPY . .

################################################################################
# RUNTIME IMAGE
################################################################################
FROM node:20-buster-slim

WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "start"]
