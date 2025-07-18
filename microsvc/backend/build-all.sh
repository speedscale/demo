#!/bin/bash
set -e

echo "Building user-service..."
(cd user-service && mvn clean install)

echo "Building accounts-service..."
(cd accounts-service && mvn clean install)

echo "Building transactions-service..."
(cd transactions-service && mvn clean install)

echo "Building api-gateway..."
(cd api-gateway && mvn clean install)

echo "All services built successfully!"
