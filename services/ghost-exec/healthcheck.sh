#!/usr/bin/env bash
PORT="${PORT:-7260}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
