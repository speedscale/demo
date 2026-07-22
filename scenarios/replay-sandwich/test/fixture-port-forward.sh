#!/usr/bin/env bash

set -euo pipefail

PORT=${LOCAL_PORT:?} exec node "${FIXTURE_SERVER:?}"
