FROM ruby:3.2-slim

WORKDIR /app

# Copy Gemfile and install dependencies
COPY Gemfile ./
RUN bundle install --without development test

# Copy client script
COPY client.rb ./

# Make script executable
RUN chmod +x client.rb

# Run the client
CMD ["ruby", "client.rb"]
