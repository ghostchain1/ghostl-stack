#!/usr/bin/env sh
set -eu

# Blockscout uses legacy env var names. Keep operator-facing config GST-native.
if [ -n "${GST_JSONRPC_HTTP_URL:-}" ] && [ -z "${ETHEREUM_JSONRPC_HTTP_URL:-}" ]; then
  export ETHEREUM_JSONRPC_HTTP_URL="$GST_JSONRPC_HTTP_URL"
fi
if [ -n "${GST_JSONRPC_TRACE_URL:-}" ] && [ -z "${ETHEREUM_JSONRPC_TRACE_URL:-}" ]; then
  export ETHEREUM_JSONRPC_TRACE_URL="$GST_JSONRPC_TRACE_URL"
fi
if [ -n "${GST_JSONRPC_WS_URL:-}" ] && [ -z "${ETHEREUM_JSONRPC_WS_URL:-}" ]; then
  export ETHEREUM_JSONRPC_WS_URL="$GST_JSONRPC_WS_URL"
fi

exec /app/bin/blockscout start
