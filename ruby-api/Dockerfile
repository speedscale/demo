FROM ruby:3.2-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Gemfile and install gems
COPY Gemfile Gemfile.lock* ./
RUN bundle config set --local deployment 'true' && \
    bundle config set --local without 'development test' && \
    bundle install

# Production stage
FROM ruby:3.2-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy gems from builder
COPY --from=builder /app/vendor/bundle /app/vendor/bundle
COPY --from=builder /usr/local/bundle/config /usr/local/bundle/config

# Copy application code
COPY . .

# Set bundle path
RUN bundle config set --local deployment 'true' && \
    bundle config set --local without 'development test'

EXPOSE 3000

CMD ["bundle", "exec", "ruby", "app.rb"]
