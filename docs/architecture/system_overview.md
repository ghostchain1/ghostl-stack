```mermaid
flowchart LR
  UI[Next.js UI] --> PIL[Compliance Engine (PIL)]
  PIL --> Registry[Compliance Registry]
  PIL --> Policies[Policy Packs]
  PIL --> Signals[Legal Signals]
  RPCGW[RPC Gateway] --> PIL
  RPCGW --> L1[GhostChain L1]
  RPCGW --> L2[GhostL2]
  RPCGW --> L3[GhostL3]
  UI --> RPCGW
```
