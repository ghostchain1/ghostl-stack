#!/usr/bin/env bash
PORT="${PORT:-7261}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
