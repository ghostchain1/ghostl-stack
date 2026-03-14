#!/bin/sh
# ghost-geth entrypoint — GhostChain L1 execution client wrapper
# Prints the GhostChain banner, then delegates to the requested binary (default: geth).
set -e

cat <<'BANNER'
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗ ██████╗  ███████╗████████╗██╗  ██╗
 ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔════╝  ██╔════╝╚══██╔══╝██║  ██║
 ██║  ███╗███████║██║   ██║███████╗   ██║   ██║  ███╗ █████╗     ██║   ███████║
 ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ██║   ██║ ██╔══╝     ██║   ██╔══██║
 ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ╚██████╔╝ ███████╗   ██║   ██║  ██║
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝
BANNER

echo "[ghost-geth] GhostChain L1 execution client — chain-id ${CHAIN_ID:-14000101}"
echo "[ghost-geth] delegating to: $*"
exec "$@"
