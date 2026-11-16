#!/bin/bash
# Sends a day's mix of support-inbox webhooks and catalog reads.
set -euo pipefail
HOST="${1:-localhost:4143}"
post() { curl -s -o /dev/null -w "%{http_code} $1\n" -X POST "http://${HOST}/tickets" -H 'Content-Type: application/json' -d "{\"from\": $(jq -Rn --arg v "$1" '$v'), \"subject\": \"$2\"}"; }
get() { curl -s -o /dev/null -w "%{http_code} GET $1\n" "http://${HOST}$1"; }

get /healthz
post 'Ada Lovelace <ada@example.org>' 'Cannot log in'
post 'grace@example.com' 'Invoice question'
post '"Hopper, Grace" <grace.hopper@example.com>' 'Refund status'
post 'Doe, John <john.doe@example.net>' 'Password reset'
get /catalog
post 'Linus <linus@example.org>' 'API rate limit'
post 'ops@[192.0.2.10]' 'Webhook failures'
post 'Margaret Hamilton <margaret@example.edu>' 'Feature request'
post 'alice@example.org, bob@example.org' 'Shared account access'
post '<noreply@example.com>' 'Auto-reply'
post 'Smith, Jane <jane.smith@example.co.uk>' 'Billing address change'
post 'Ken Thompson <ken@example.com>' 'Bug report'
get /catalog
