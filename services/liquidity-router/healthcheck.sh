#!/usr/bin/env sh
set -eu

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7607}"

curl -fsS "http://${HOST}:${PORT}/health" >/dev/null

