# Proxymock CI/CD Integration for ruby-api

This document explains how proxymock traffic replay has been integrated into the CI/CD pipeline for the ruby-api demo application.

## Overview

Proxymock has been integrated into the GitHub Actions CI/CD pipeline to automatically replay recorded API traffic against the ruby-api application on every push and pull request. This ensures that:

1. API responses remain consistent across code changes
2. External API dependencies (WorldTimeAPI, GitHub API) are properly mocked
3. Database interactions are validated
4. Performance and behavior regressions are caught early

## Files Added

### 1. `proxymock.sh`

The main integration script that:
- Validates the `SPEEDSCALE_API_KEY` is available
- Installs proxymock if not already present
- Optionally starts a mock server for external API dependencies
- Starts the ruby-api application
- Replays recorded traffic against the application
- Compares results and reports differences

**Configuration via environment variables:**
- `APP_PORT` (default: 3000) - Port where ruby-api listens
- `PROXYMOCK_TRAFFIC_DIR` (default: `./proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e`) - Directory with recorded traffic
- `PROXYMOCK_OUTPUT_DIR` (default: `./proxymock/replayed-<timestamp>`) - Output directory for replay results
- `APP_START_CMD` (default: `ruby app.rb`) - Command to start the application
- `USE_MOCK_SERVER` (default: `true`) - Whether to mock external APIs
- `SPEEDSCALE_API_KEY` (required) - Proxymock API key

### 2. GitHub Actions Workflow Updates

Added a new job `proxymock-replay` to `.github/workflows/ci.yaml` that:
- Runs after the build job
- Sets up Ruby 3.2 and PostgreSQL
- Executes the `proxymock.sh` script
- Uploads replay results and logs as artifacts
- Blocks deployment if replay fails

## CI/CD Pipeline Flow

```
┌─────────────┐
│  Validate   │
└──────┬──────┘
       │
┌──────▼──────┐
│    Test     │
└──────┬──────┘
       │
┌──────▼──────┐
│    Build    │
└──────┬──────┘
       │
┌──────▼──────────────┐
│ Proxymock Replay    │  ← NEW STEP
│                     │
│ 1. Setup Ruby       │
│ 2. Setup PostgreSQL │
│ 3. Run proxymock.sh │
│ 4. Validate results │
└──────┬──────────────┘
       │
┌──────▼──────┐
│   Docker    │ (only on master)
└─────────────┘
```

## Setup Requirements

### 1. GitHub Secrets

You need to add the following secret to your GitHub repository:

**`SPEEDSCALE_API_KEY`** - Your proxymock API key
- Go to: Repository Settings → Secrets and variables → Actions → New repository secret
- Name: `SPEEDSCALE_API_KEY`
- Value: Your proxymock API key

To get your API key:
```bash
# If you have proxymock installed locally
SPEEDSCALE_CONFIG_FILE=$(proxymock version | grep 'Config File' | awk '{print $3}')
cat $SPEEDSCALE_CONFIG_FILE | grep apikey | awk '{print $2}'
```

### 2. Recorded Traffic

The pipeline expects recorded traffic to be present in the repository at:
```
ruby-api/proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e/
```

If you need to record new traffic:
```bash
cd ruby-api

# Start recording
proxymock record \
  --out-directory ./proxymock/recorded-$(date +%Y-%m-%d_%H-%M-%S) \
  --app-port 3000

# Run your API tests or use the client
# ...

# Stop recording (Ctrl+C)
```

## Running Locally

You can run the proxymock replay locally to test before pushing:

```bash
cd ruby-api

# Set your API key
export SPEEDSCALE_API_KEY=your-api-key-here

# Run the script
./proxymock.sh
```

### Local Testing Options

**With PostgreSQL (full integration):**
```bash
# Start PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tasks_db \
  -p 5432:5432 \
  postgres:15

# Run replay
export USE_MOCK_SERVER=false
./proxymock.sh
```

**With Mock Server (faster, no DB needed):**
```bash
# Run replay with mocked external APIs and DB
export USE_MOCK_SERVER=true
./proxymock.sh
```

## Viewing Results

### In GitHub Actions

1. Go to the Actions tab in your repository
2. Click on the workflow run
3. Click on the `proxymock-replay` job
4. View the console output for replay results
5. Download artifacts for detailed results:
   - `proxymock-replay-results` - Contains replayed traffic files
   - `proxymock-logs` (on failure) - Contains detailed logs

### Locally

After running `./proxymock.sh`:
```bash
# View replay summary
cat proxymock/replayed-*/comparison.log

# View detailed logs
cat proxymock/replayed-*.log

# Compare traffic
proxymock compare \
  --in proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e \
  proxymock/replayed-*
```

## Troubleshooting

### "SPEEDSCALE_API_KEY not set" Error

**In CI:**
- Verify the secret is set in GitHub: Settings → Secrets → Actions
- Check the secret name is exactly `SPEEDSCALE_API_KEY`

**Locally:**
```bash
export SPEEDSCALE_API_KEY=$(proxymock version | grep 'Config File' | xargs -I {} sh -c 'cat {} | grep apikey | awk "{print \$2}"')
```

### Application Fails to Start

Check the logs:
```bash
# In CI: Download the proxymock-logs artifact

# Locally:
cat app.log
```

Common causes:
- PostgreSQL not running or not accessible
- Port 3000 already in use
- Missing environment variables

### Replay Shows Differences

This is expected when:
- Code changes affect API responses (intended)
- External API responses have changed (use mock server)
- Database state differs (ensure clean state)

Review the comparison output to determine if differences are expected:
```bash
proxymock compare --in recorded/ replayed/
```

### Mock Server Not Starting

Check that:
- Port 4143 is available (mock server default port)
- Recorded traffic directory exists and contains valid RRPair files

## Customization

### Using Different Traffic Recordings

Update the `PROXYMOCK_TRAFFIC_DIR` environment variable:

**In CI (`.github/workflows/ci.yaml`):**
```yaml
env:
  PROXYMOCK_TRAFFIC_DIR: ./proxymock/your-recording-directory
```

**Locally:**
```bash
export PROXYMOCK_TRAFFIC_DIR=./proxymock/your-recording-directory
./proxymock.sh
```

### Changing Application Port

**In CI:**
```yaml
env:
  APP_PORT: 8080
```

**Locally:**
```bash
export APP_PORT=8080
./proxymock.sh
```

### Disabling Mock Server

To use real external APIs instead of mocks:

**In CI:**
```yaml
env:
  USE_MOCK_SERVER: 'false'
```

**Locally:**
```bash
export USE_MOCK_SERVER=false
./proxymock.sh
```

## Additional Resources

- [Proxymock CI/CD Guide](https://docs.speedscale.com/proxymock/guides/cicd/)
- [Proxymock Documentation](https://docs.speedscale.com/proxymock/)
- [Ruby API README](./README.md)

## Support

For issues or questions:
- Check the [proxymock documentation](https://docs.speedscale.com/proxymock/)
- Join the Speedscale community Slack
- Open an issue in this repository
