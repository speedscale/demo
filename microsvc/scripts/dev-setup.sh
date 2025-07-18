#!/bin/bash

# Banking Application Development Setup Script
# This script sets up the development environment

set -e

echo "🏦 Banking Application Development Setup"
echo "========================================"

# Create scripts directory if it doesn't exist
mkdir -p scripts

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker and try again."
    exit 1
fi

# Create .env file from template if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp .env.template .env
    echo "✅ .env file created. Please review and update the values if needed."
else
    echo "✅ .env file already exists"
fi

# Create log directory
echo "📁 Creating log directories..."
mkdir -p logs
mkdir -p logs/services

# Start the database first
echo "🐘 Starting PostgreSQL database..."
docker compose up -d postgres

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Check database connectivity
echo "🔍 Checking database connectivity..."
if docker compose exec postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ Database is ready"
else
    echo "❌ Database is not ready. Please check the logs."
    docker compose logs postgres
    exit 1
fi

# Start observability stack
echo "📊 Starting observability stack..."
docker compose up -d jaeger prometheus grafana

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "📋 Available Services:"
echo "   Database (PostgreSQL): http://localhost:5432"
echo "   Jaeger Tracing:        http://localhost:16686"
echo "   Prometheus:            http://localhost:9090"
echo "   Grafana:               http://localhost:3001 (admin/admin)"
echo ""
echo "🔧 Next Steps:"
echo "   1. Implement the backend services (Phase 2)"
echo "   2. Start services with: docker compose up -d"
echo "   3. View logs with: docker compose logs -f [service-name]"
echo "   4. Stop services with: docker compose down"
echo ""
echo "📚 Documentation:"
echo "   - README.md for project overview"
echo "   - plan.md for implementation phases"
echo "   - database/README.md for database setup"