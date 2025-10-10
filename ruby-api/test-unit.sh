#!/usr/bin/env bash

set -e

echo "Running unit tests..."
echo ""

# Check if rspec is available
if ! bundle exec rspec --version > /dev/null 2>&1; then
  echo "Installing test dependencies..."
  bundle install --quiet
fi

# Run rspec tests
bundle exec rspec spec/

echo ""
echo "✓ Unit tests completed"
