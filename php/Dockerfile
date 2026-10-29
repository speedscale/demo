# syntax=docker/dockerfile:1.7
################################################################################
# BUILDER IMAGE
################################################################################
FROM php:8.3.36-cli-alpine@sha256:86a7a8f46bbf73120a19cf72246f606b6de9aaa84a00971c25d187fbae44c211 AS build

# Install composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Workdir
WORKDIR /app

# Install deps with only the manifests for better caching
COPY composer.json composer.lock* ./

# Install dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Now copy the rest of the app
COPY . .

# ------------------------------------------------------------------------------
# RUNTIME STAGE (optional; keeps image small)
# ------------------------------------------------------------------------------
FROM php:8.3.36-cli-alpine@sha256:86a7a8f46bbf73120a19cf72246f606b6de9aaa84a00971c25d187fbae44c211

WORKDIR /app

# Copy vendor and source from build stage
COPY --from=build /app /app

EXPOSE 8081
CMD ["php", "-S", "0.0.0.0:8081", "index.php"]
