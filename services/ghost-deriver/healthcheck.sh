#!/usr/bin/env bash
PORT="${PORT:-7262}"
curl -sf "http://localhost:${PORT}/healthz" > /dev/null
