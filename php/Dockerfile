# syntax=docker/dockerfile:1.7
################################################################################
# BUILDER IMAGE
################################################################################
FROM php:8.3-cli-alpine AS build

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
FROM php:8.3-cli-alpine

WORKDIR /app

# Copy vendor and source from build stage
COPY --from=build /app /app

EXPOSE 8081
CMD ["php", "-S", "0.0.0.0:8081", "index.php"]
