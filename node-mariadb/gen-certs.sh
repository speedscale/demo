#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# gen-certs.sh – Generate a self-signed CA + server certificate for MariaDB TLS
#
# Creates:
#   certs/ca.pem          – CA certificate  (shared with the Node client)
#   certs/ca-key.pem      – CA private key
#   certs/server-cert.pem – MariaDB server certificate
#   certs/server-key.pem  – MariaDB server private key
#
# The CA cert is what the Node.js app uses as DB_SSL_CA to verify the server.
# ---------------------------------------------------------------------------
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$CERT_DIR"

echo "==> Generating CA key and certificate..."
openssl genrsa 2048 > "$CERT_DIR/ca-key.pem"
openssl req -new -x509 -nodes -days 3650 \
  -key "$CERT_DIR/ca-key.pem" \
  -out "$CERT_DIR/ca.pem" \
  -subj "/CN=MariaDB-Demo-CA"

echo "==> Generating server key and CSR..."
openssl genrsa 2048 > "$CERT_DIR/server-key.pem"
openssl req -new -nodes \
  -key "$CERT_DIR/server-key.pem" \
  -out "$CERT_DIR/server-req.pem" \
  -subj "/CN=mariadb"

echo "==> Signing server certificate with CA..."
# SAN includes both the Docker Compose service name and localhost
openssl x509 -req -days 3650 \
  -in "$CERT_DIR/server-req.pem" \
  -CA "$CERT_DIR/ca.pem" \
  -CAkey "$CERT_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERT_DIR/server-cert.pem" \
  -extfile <(printf "subjectAltName=DNS:mariadb,DNS:localhost,IP:127.0.0.1")

rm -f "$CERT_DIR/server-req.pem" "$CERT_DIR/ca.srl"

# MariaDB needs the key readable by its user (mysql)
chmod 644 "$CERT_DIR/server-key.pem"

echo ""
echo "Certificates generated in $CERT_DIR"
ls -l "$CERT_DIR"
