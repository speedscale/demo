#!/bin/bash
set -e

# proxymock CI/CD Integration Script for ruby-api
# This script replays recorded traffic against the ruby-api application

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting proxymock CI/CD integration for ruby-api${NC}"

# Configuration
APP_PORT=${APP_PORT:-3000}
PROXYMOCK_TRAFFIC_DIR=${PROXYMOCK_TRAFFIC_DIR:-"./proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e"}
PROXYMOCK_OUTPUT_DIR=${PROXYMOCK_OUTPUT_DIR:-"./proxymock/replayed-$(date +%Y-%m-%d_%H-%M-%S)"}
APP_START_CMD=${APP_START_CMD:-"ruby app.rb"}
USE_MOCK_SERVER=${USE_MOCK_SERVER:-true}

# Validate API key
if [ -z "$SPEEDSCALE_API_KEY" ]; then
  echo -e "${YELLOW}Warning: SPEEDSCALE_API_KEY not set. Attempting to retrieve from config...${NC}"

  SPEEDSCALE_CONFIG_FILE=$(proxymock version 2>/dev/null | grep 'Config File' | awk '{print $3}' || echo "")

  if [ -n "$SPEEDSCALE_CONFIG_FILE" ] && [ -f "$SPEEDSCALE_CONFIG_FILE" ]; then
    SPEEDSCALE_API_KEY=$(grep apikey "$SPEEDSCALE_CONFIG_FILE" | awk '{print $2}')
    export SPEEDSCALE_API_KEY
    echo -e "${GREEN}Retrieved API key from config file${NC}"
  else
    echo -e "${RED}Error: Could not find SPEEDSCALE_API_KEY${NC}"
    echo "Please set SPEEDSCALE_API_KEY environment variable or configure proxymock"
    exit 1
  fi
fi

# Check if proxymock is installed
if ! command -v proxymock &> /dev/null; then
  echo -e "${YELLOW}proxymock not found. Installing...${NC}"

  # Determine OS and architecture
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$ARCH" in
    x86_64)
      ARCH="amd64"
      ;;
    aarch64|arm64)
      ARCH="arm64"
      ;;
  esac

  # Download and install proxymock
  curl -fsSL "https://downloads.speedscale.com/proxymock/latest/proxymock-${OS}-${ARCH}" -o /tmp/proxymock
  chmod +x /tmp/proxymock
  sudo mv /tmp/proxymock /usr/local/bin/proxymock

  echo -e "${GREEN}proxymock installed successfully${NC}"
fi

# Verify proxymock installation
proxymock version
echo ""

# Check if traffic directory exists
if [ ! -d "$PROXYMOCK_TRAFFIC_DIR" ]; then
  echo -e "${RED}Error: Traffic directory not found: $PROXYMOCK_TRAFFIC_DIR${NC}"
  echo "Please ensure you have recorded traffic before running replay"
  exit 1
fi

echo -e "${GREEN}Found recorded traffic in: $PROXYMOCK_TRAFFIC_DIR${NC}"

# Set up database environment variables for the app
export DB_HOST=${DB_HOST:-localhost}
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-tasks_db}
export DB_USER=${DB_USER:-postgres}
export DB_PASSWORD=${DB_PASSWORD:-postgres}
export JWT_SECRET=${JWT_SECRET:-development-secret-change-me}

# Start PostgreSQL if needed (local development)
if [ "$USE_MOCK_SERVER" = false ]; then
  echo -e "${YELLOW}Note: USE_MOCK_SERVER=false, expecting real PostgreSQL at ${DB_HOST}:${DB_PORT}${NC}"
fi

# Function to cleanup background processes
cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"

  if [ -n "$APP_PID" ]; then
    echo "Stopping application (PID: $APP_PID)"
    kill $APP_PID 2>/dev/null || true
  fi

  if [ -n "$MOCK_PID" ]; then
    echo "Stopping mock server"
    pkill -P $MOCK_PID 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

# Start mock server if enabled
if [ "$USE_MOCK_SERVER" = true ]; then
  echo -e "${GREEN}Starting proxymock mock server...${NC}"

  # Start mock server in background
  proxymock mock \
    --in-directory "$PROXYMOCK_TRAFFIC_DIR" \
    --out-directory "$PROXYMOCK_OUTPUT_DIR-mock" \
    --log-to "$PROXYMOCK_OUTPUT_DIR-mock.log" &

  MOCK_PID=$!

  # Wait for mock server to start
  sleep 5

  # Set environment variables to use mock server
  export HTTP_PROXY=http://localhost:4143
  export HTTPS_PROXY=http://localhost:4143
  export NO_PROXY=localhost,127.0.0.1

  echo -e "${GREEN}Mock server started (PID: $MOCK_PID)${NC}"
fi

# Start the Ruby application
echo -e "${GREEN}Starting ruby-api application on port $APP_PORT...${NC}"
$APP_START_CMD > app.log 2>&1 &
APP_PID=$!

echo -e "${GREEN}Application started (PID: $APP_PID)${NC}"

# Wait for application to be ready
echo "Waiting for application to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$APP_PORT/health" | grep -q "200"; then
    echo -e "${GREEN}Application is ready!${NC}"
    break
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Attempt $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Error: Application failed to start within timeout${NC}"
    echo "Application logs:"
    tail -50 app.log
    exit 1
  fi
done

# Run proxymock replay
echo -e "${GREEN}Starting traffic replay...${NC}"
echo "Replaying traffic from: $PROXYMOCK_TRAFFIC_DIR"
echo "Output directory: $PROXYMOCK_OUTPUT_DIR"
echo ""

proxymock replay \
  --in-directory "$PROXYMOCK_TRAFFIC_DIR" \
  --out-directory "$PROXYMOCK_OUTPUT_DIR" \
  --test-against "http://localhost:$APP_PORT" \
  --log-to "$PROXYMOCK_OUTPUT_DIR.log"

REPLAY_EXIT_CODE=$?

# Show summary
echo ""
echo "================================"
echo "proxymock Replay Summary"
echo "================================"
echo "Exit Code: $REPLAY_EXIT_CODE"
echo "Output Directory: $PROXYMOCK_OUTPUT_DIR"
echo "Log File: $PROXYMOCK_OUTPUT_DIR.log"
echo ""

if [ $REPLAY_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ Traffic replay completed successfully!${NC}"

  # Show comparison results if available
  if [ -d "$PROXYMOCK_OUTPUT_DIR" ]; then
    echo ""
    echo "Comparing recorded vs replayed traffic..."
    proxymock compare --in "$PROXYMOCK_TRAFFIC_DIR" "$PROXYMOCK_OUTPUT_DIR" || true
  fi
else
  echo -e "${RED}✗ Traffic replay failed with exit code $REPLAY_EXIT_CODE${NC}"
  echo ""
  echo "Application logs (last 50 lines):"
  tail -50 app.log
  echo ""
  echo "Replay logs (last 50 lines):"
  tail -50 "$PROXYMOCK_OUTPUT_DIR.log" 2>/dev/null || echo "No replay log found"
fi

exit $REPLAY_EXIT_CODE
