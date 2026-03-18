#!/bin/sh
# ghost-geth entrypoint — GhostChain L1 execution client wrapper
# Prints the GhostChain banner, then delegates to the requested binary (default: geth).
set -e

cat >&2 <<'BANNER'
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗ ██████╗  ███████╗████████╗██╗  ██╗
 ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔════╝  ██╔════╝╚══██╔══╝██║  ██║
 ██║  ███╗███████║██║   ██║███████╗   ██║   ██║  ███╗ █████╗     ██║   ███████║
 ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ██║   ██║ ██╔══╝     ██║   ██╔══██║
 ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ╚██████╔╝ ███████╗   ██║   ██║  ██║
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝
BANNER

printf '%s\n' "[ghost-geth] GhostChain L1 execution client — chain-id ${CHAIN_ID:-14000101}" >&2
printf '%s\n' "[ghost-geth] delegating to: $*" >&2
exec "$@"
