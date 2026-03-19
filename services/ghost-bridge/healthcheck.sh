#!/usr/bin/env bash
PORT="${PORT:-7264}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
