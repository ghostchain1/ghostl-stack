#!/usr/bin/env bash
PORT="${PORT:-7263}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
