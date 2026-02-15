# HGOP API

Base URL (default):

- Direct: `http://127.0.0.1:7077`
- Via Next proxy: `http://localhost:3200/api/hyperghost`

## Health

### GET `/health`

Returns supervisor identity and gate states.

### GET `/status`

Returns:

- gate states
- open incident counts by severity
- failed probe count + probe snapshots
- computed risk score

## Incidents

### GET `/incidents?status=&scope=&severity=&env=`

List incidents (defaults to the supervisor env).

### POST `/incidents`

Creates an incident.

Body:

```json
{
  "scope": "rollup:l3",
  "severity": "P1",
  "title": "L3 finality lag above threshold"
}
```

### GET `/incidents/:id`

Returns incident + evidence.

### POST `/incidents/:id/evidence`

Registers evidence metadata (URI + optional hash).

## Proposals

### POST `/proposals/generate`

Generates a proposal + ranked fixes for a given `incidentId`.

Body:

```json
{ "incidentId": "inc_..." }
```

### GET `/proposals`

Lists proposals for the supervisor env.

### GET `/proposals/:id`

Returns proposal + incident + evidence + fixes.

### POST `/proposals/:id/attest` (dev/test only)

Signs a snapshot of `{proposal, incident, fixes}` using `HG_ATTESTOR_PRIVATE_KEY`.

### POST `/proposals/:id/submit-governance`

Writes CMF bundle + governance calldata templates and marks proposal as submitted.

## Artifacts

### GET `/artifacts/cmf/:proposalId/*tail`

Downloads files under the CMF directory.

Example (via Next proxy):

```bash
curl -fsS http://localhost:3200/api/hyperghost/artifacts/cmf/prop_123/change-manifest.json | jq .
```

## Execution

### POST `/execute/:proposalId/:fixId`

Env gates:

- mainnet: always `403 MAINNET_PROPOSAL_ONLY`
- testnet: requires `HGOP_EXEC_ENABLED=1` and approval token
- devnet: requires `HGOP_EXEC_ENABLED=1`

v1 executor records an execution as `blocked` unless an explicit executor allowlist is implemented.

## Approval Token

For gated mutating endpoints, supply an approval token header:

- `x-hgop-approval-token: <token>`

