#!/usr/bin/env bash
PORT="${PORT:-7265}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
