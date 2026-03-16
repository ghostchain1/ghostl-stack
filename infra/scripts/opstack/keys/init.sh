#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"
OP_DIR="$ROOT/infra/opstack"
ENV_FILE="$OP_DIR/.env"
export NODE_PATH="$ROOT/contracts/node_modules${NODE_PATH:+":$NODE_PATH"}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (copy .env.sample first)" >&2
  exit 1
fi

gen_key() {
  node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"
}

addr_for_key() {
  node -e "const { Wallet } = require('@ghostchain/sdk'); console.log(new Wallet(process.argv[1]).address)" "$1"
}

echo "Generating fresh L2 keys..."
SEQ_KEY=$(gen_key)
BAT_KEY=$(gen_key)
PROP_KEY=$(gen_key)
CHAL_KEY=$(gen_key)

SEQ_ADDR=$(addr_for_key "$SEQ_KEY")
BAT_ADDR=$(addr_for_key "$BAT_KEY")
PROP_ADDR=$(addr_for_key "$PROP_KEY")
CHAL_ADDR=$(addr_for_key "$CHAL_KEY")

tmp="$(mktemp)"
sed -e "s/^SEQUENCER_KEY=.*/SEQUENCER_KEY=$SEQ_KEY/" \
    -e "s/^BATCHER_KEY=.*/BATCHER_KEY=$BAT_KEY/" \
    -e "s/^PROPOSER_KEY=.*/PROPOSER_KEY=$PROP_KEY/" \
    -e "s/^CHALLENGER_KEY=.*/CHALLENGER_KEY=$CHAL_KEY/" \
    -e "s/^SEQUENCER_ADDRESS=.*/SEQUENCER_ADDRESS=$SEQ_ADDR/" \
    -e "s/^BATCH_SENDER_ADDRESS=.*/BATCH_SENDER_ADDRESS=$BAT_ADDR/" \
    -e "s/^PROPOSER_ADDRESS=.*/PROPOSER_ADDRESS=$PROP_ADDR/" \
    -e "s/^CHALLENGER_ADDRESS=.*/CHALLENGER_ADDRESS=$CHAL_ADDR/" \
  "$ENV_FILE" >"$tmp"
mv "$tmp" "$ENV_FILE"

echo "Updated keys in $ENV_FILE"
echo "Sequencer:  $SEQ_KEY ($SEQ_ADDR)"
echo "Batcher:    $BAT_KEY ($BAT_ADDR)"
echo "Proposer:   $PROP_KEY ($PROP_ADDR)"
echo "Challenger: $CHAL_KEY ($CHAL_ADDR)"
