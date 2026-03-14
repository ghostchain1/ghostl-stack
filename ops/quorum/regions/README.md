# Region Attestations

Place one JSON file per region in this directory.

Example format:
```
{
  "region": "us-east",
  "attestationHash": "<sha256-of-immutability-attestation>",
  "zkHash": "<sha256-of-zk-proof>",
  "timestamp": "2026-01-01T00:00:00Z",
  "signature": "<base64-signature>",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

Signatures are verified against `attestationHash:zkHash` if `requireSignature=true`.
