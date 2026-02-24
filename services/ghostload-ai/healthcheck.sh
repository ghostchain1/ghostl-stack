#!/bin/sh
set -eu
curl -sf "http://127.0.0.1:${PORT:-7688}/health" >/dev/null
