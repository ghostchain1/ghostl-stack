# Post-Quantum Migration Playbook

## Status: Hybrid Transitional (Classical secure, PQ stub)

GhostChain uses a **hybrid signature scheme** combining:
- **Ed25519** (classical, 128-bit security) — production-ready today
- **ML-DSA-87** (post-quantum, NIST FIPS 204, 256-bit PQ security) — **structural stub pending**

The current PQ layer (`packages/pq-crypto/src/pq-stub.js`) uses HMAC-SHA3-512 as a
structural placeholder that maintains the correct API surface while ML-DSA-87 bindings
are finalized for the Node.js ecosystem.

---

## Why Hybrid?

A hybrid scheme provides:

1. **No regression today**: Ed25519 provides full classical security while PQ layer matures.
2. **Forward secrecy against quantum adversaries**: Once PQ layer is real, an attacker with
   a quantum computer cannot forge governance signatures.
3. **Harvest-now-decrypt-later protection**: Any governance messages signed today remain
   secure even if quantum computers become available in 5-10 years.
4. **NIST migration compliance**: Aligned with NIST IR 8413 hybrid KEM/signature guidance.

---

## Migration Steps

### Step 1: Install `@noble/post-quantum`

```bash
cd packages/pq-crypto
npm install @noble/post-quantum
```

### Step 2: Replace `src/pq-stub.js`

Replace the entire stub file with a real ML-DSA-87 wrapper:

```js
// src/pq-stub.js  (after migration)
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';

export function generatePQKeyPair() {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const { secretKey, publicKey } = ml_dsa87.keygen(seed);
  return { secretKey, publicKey };
}

export function pqSign(message, secretKey) {
  return ml_dsa87.sign(secretKey, message);
}

export function pqVerify(message, signature, publicKey) {
  // publicKey only — no secretKey needed
  return ml_dsa87.verify(publicKey, message, signature);
}

export const IS_STUB = false;
export const ALGORITHM = 'ML-DSA-87';
export const PRODUCTION_ALGORITHM = 'ML-DSA-87';
```

### Step 3: Update `hybridVerify` in `index.js`

The stub requires `secretKey` for verification (structural limitation).
Real ML-DSA only requires `publicKey`:

```diff
- const pqOk = pqVerify(msg, pqSigBytes, keys.pq.publicKey, keys.pq.secretKey);
+ const pqOk = pqVerify(msg, pqSigBytes, keys.pq.publicKey);
```

### Step 4: Rotate all governance signing keys

```bash
# Generate new hybrid key pair for each governor
node -e "
  import('@ghostchain/pq-crypto').then(({ generateHybridKeyPair }) => {
    const kp = generateHybridKeyPair();
    console.log(JSON.stringify({ classical: kp.classical.publicKey, pq: Buffer.from(kp.pq.publicKey).toString('hex') }));
  });
"
```

Publish new public keys to:
- `infra/safeops/allowlist.yml` (PQ section)
- On-chain governance key registry

### Step 5: Dual-sign for transition period (6 months)

During transition, sign all governance bundles with:
1. New hybrid keys (Ed25519 + ML-DSA-87)
2. Legacy Ed25519-only keys

This ensures existing validators can still verify during rollout.

### Step 6: Remove legacy key registry entries

After all validators have upgraded, remove the pre-PQ key entries from the allowlist.

---

## Timeline

| Phase | Target | Status |
|-------|--------|--------|
| Hybrid API surface | 2026 Q1 | ✅ Done (this PR) |
| `@noble/post-quantum` GA | 2026 Q2 | Pending |
| Key rotation (governors) | 2026 Q2 | Pending |
| Dual-sign transition period | 2026 Q2-Q3 | Pending |
| Legacy key removal | 2026 Q4 | Pending |
| Full PQ enforcement in CI | 2026 Q4 | Pending |

---

## Algorithm Reference

| Layer | Algorithm | Standard | Security |
|-------|-----------|----------|----------|
| Classical | Ed25519 | RFC 8032 | 128-bit classical |
| PQ (target) | ML-DSA-87 | NIST FIPS 204 | 256-bit PQ |
| PQ (stub) | HMAC-SHA3-512 | Structural stub only | Not PQ-secure |
| Hash | SHA-256 | FIPS 180-4 | Message integrity |

---

## Monitoring

Track PQ migration status via CI policy gate.
The check `pq-stub-status` in `.github/workflows/policy-gate.yml` will:
- WARN when `IS_STUB=true`
- FAIL when `IS_STUB=true` after the 2026 Q3 deadline gate

This doc is referenced by `packages/pq-crypto/package.json#pqNote`.
