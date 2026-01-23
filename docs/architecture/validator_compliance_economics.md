```mermaid
flowchart LR
  Validator[Validator] --> Score[Compliance Score]
  Score --> Rewards[Reward Multiplier]
  Score --> Slashing[Soft Slashing]
  PIL[Protocol Intelligence Layer] --> Score
  Governance[Governance] --> Score
```
