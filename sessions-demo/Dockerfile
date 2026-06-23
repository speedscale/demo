# syntax=docker/dockerfile:1.7
# No external dependencies, so a single stage that copies the source is enough.
FROM node:20-buster-slim

WORKDIR /app
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
