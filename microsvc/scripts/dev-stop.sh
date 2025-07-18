#!/bin/bash

# Banking Application Development Stop Script
# This script stops all development services

set -e

echo "🛑 Stopping Banking Application Development Environment"
echo "====================================================="

# Stop all services
echo "🔄 Stopping all services..."
docker compose down

# Option to remove volumes
read -p "🗑️  Do you want to remove volumes (this will delete all data)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing volumes..."
    docker compose down -v
    echo "✅ Volumes removed"
fi

# Option to remove images
read -p "🗑️  Do you want to remove built images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing images..."
    docker compose down --rmi all
    echo "✅ Images removed"
fi

echo ""
echo "✅ Development environment stopped successfully!"
echo ""
echo "🔄 To start again, run: ./scripts/dev-setup.sh"