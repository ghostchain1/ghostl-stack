# L1 Operations Runbook

Evidence index: `docs/evidence/README.md`

## Quick checks

```bash
# L1 health
grep -n "FAIL" /var/log/ghostchain/l1.log || true
infra/scripts/doctor-l1.sh
```

## Constitutional governance verification (devnet)

```bash
RPC_L1=$(rg -n "^RPC_L1=" -m1 services/stack.env | cut -d= -f2- | sed 's/host.docker.internal/localhost/')
AI_CONSTITUTION_PROPOSAL_ADDRESS=$(rg -n "^AI_CONSTITUTION_PROPOSAL_ADDRESS=" -m1 services/stack.env | cut -d= -f2-)
GOVERNOR_ADDRESS_L1=$(rg -n "^GOVERNOR_ADDRESS_L1=" -m1 services/stack.env | cut -d= -f2-)
CONSTITUTION_HASH=$(rg -n "^CONSTITUTION_HASH=" -m1 services/stack.env | cut -d= -f2-)

NODE_PATH=contracts/node_modules node -e "const {ethers}=require('ethers'); const rpc=process.env.RPC_L1; const proposal=process.env.AI_CONSTITUTION_PROPOSAL_ADDRESS; const governor=process.env.GOVERNOR_ADDRESS_L1; const expected=process.env.CONSTITUTION_HASH?.toLowerCase(); const provider=new ethers.JsonRpcProvider(rpc); const propAbi=['function ratified() view returns (bool)','function ratifiedAt() view returns (uint64)','function activatesAt() view returns (uint64)','function constitutionHash() view returns (bytes32)','function ratificationProposalId() view returns (uint256)']; const govAbi=['function proposalsLength() view returns (uint256)']; (async()=>{ const [chainId, code] = await Promise.all([provider.getNetwork(), provider.getCode(proposal)]); const prop=new ethers.Contract(proposal, propAbi, provider); const gov=new ethers.Contract(governor, govAbi, provider); const [ratified, ratifiedAt, activatesAt, constitutionHash, proposalId, proposalsLength] = await Promise.all([prop.ratified(), prop.ratifiedAt(), prop.activatesAt(), prop.constitutionHash(), prop.ratificationProposalId(), gov.proposalsLength()]); console.log('chainId', Number(chainId.chainId)); console.log('codePresent', code !== '0x'); console.log('constitutionHash', constitutionHash); console.log('matchesHash', expected ? (constitutionHash.toLowerCase() === expected) : 'unknown'); console.log('ratified', ratified); console.log('ratificationProposalId', proposalId.toString()); console.log('ratifiedAt', ratifiedAt.toString()); console.log('activatesAt', activatesAt.toString()); console.log('governorProposalsLength', proposalsLength.toString()); })();"
```

## Core endpoints

- RPC: `HOST_L1_RPC`
- WS: `HOST_L1_WS`
- Metrics: `L1_METRICS_PROM_URL`

## Standard start/stop

```bash
# Start
infra/ghostchain/scripts/up.sh

# Stop
infra/ghostchain/scripts/down.sh
```

## Common issues

### RPC unreachable
- Confirm container status: `docker compose -f infra/ghostchain/docker-compose.eth.yml ps`
- Check bind ports: `ss -lnt | rg 18545`
- Validate chain ID: `curl -fsS http://localhost:18545 -H content-type:application/json -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'`

### Metrics missing
- Confirm metrics endpoint: `curl -fsS http://localhost:18660/debug/metrics/prometheus | head -n 5`
- Verify Prometheus targets.

### Vault secrets not found
- Verify Vault env vars set: `VAULT_ADDR`, `VAULT_TOKEN` or `VAULT_ROLE_ID`/`VAULT_SECRET_ID`.
- Validate `L1_SECRETS_DIR` contains the required keys.

## Routine tasks

- Rotate validator keys only via the approved key-rotation playbook.
- Re-run `infra/scripts/doctor-l1.sh` after any config change.

## Evidence pack (latest)

- Timestamp: `20260203T123126Z`
- SHA256: `6876f1ba4e815c3b98ce8b92befd98a9a8370dbe983510a6c54f1aeb68cd3f65`
- Artifact: `infra/evidence/out/evidence-pack-l1-20260203T123126Z.zip`

```bash
sha256sum -c infra/evidence/out/evidence-pack-l1-20260203T123126Z.zip.sha256
```

## Post go/no-go cleanup

- Archive the evidence pack to long-term storage.
- Prune older `infra/evidence/out` bundles after confirming backups.

## Submodule PRs

```
op-geth: https://github.com/ghostchain1/op-geth/pull/1
optimism: https://github.com/ghostchain1/optimism/pull/1
```

## Go/No-Go gate

```bash
# Final release gate checks
infra/scripts/gates/l1-go-no-go.sh
```
