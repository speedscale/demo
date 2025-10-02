FROM ruby:3.2-slim

WORKDIR /app

# Install build dependencies for native extensions
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy Gemfile and install dependencies
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 --retry 3

# Copy client script
COPY client.rb ./

# Run the client
CMD ["ruby", "client.rb"]
