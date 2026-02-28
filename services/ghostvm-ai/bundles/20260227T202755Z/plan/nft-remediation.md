# NFT Remediation Plan 20260227T200954Z

## Scope
- l1 bridge: `br-fdf77c072ffa`
- l2 bridge: `br-315cdb4e43c9`
- l3 bridge: `br-3a47f74c6888`
- uplink iface: `enp2s0`

## Apply Commands
- `sudo nft list ruleset > /tmp/ghostnetsync-ruleset-pre-remediation.nft`
- `sudo nft -f /home/ghost/ghostl-stack/services/ghostvm-ai/plans/20260227T200954Z/nftables-remediation.conf`

## Rollback Commands
- `sudo nft -f /tmp/ghostnetsync-ruleset-pre-remediation.nft`
