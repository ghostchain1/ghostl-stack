# Sovereign Economy Simulation

Generated at: 2026-02-25T23:33:51.203Z

## Scenario Matrix

| Scenario | Name | Outcome | L1 Net Intake (GST) | Net Yield (GST) | L2/L3 Incentives (GST) |
|---|---|---|---:|---:|---:|
| S1 | Low volume L3 | PASS | 0.0488 | 0.0020 | 0.0004 |
| S2 | High congestion | PASS | 0.8730 | 0.0602 | 0.0120 |
| S3 | Yield loss scenario | WARN | 0.6825 | 0.0000 | 0.0000 |
| S4 | Treasury drawdown event | WARN | 0.3900 | 0.0000 | 0.0000 |
| S5 | Governance rejection case | EXPECTED_BLOCK | 0.6338 | 0.0000 | 0.0000 |

## Details

### S1 — Low volume L3
- Governance approved: true
- L3 captured revenue: 0.050000 GST
- L2 operations fee: 2.50% (0.001250 GST)
- L1 net treasury intake: 0.048750 GST
- External gross yield: 4.20% (0.002047 GST)
- Stress losses: 0.00% (0.000000 GST)
- Net yield: 0.002047 GST
- Distribution (reserve/validator/ecosystem/L2-L3): 0.000409 / 0.000614 / 0.000614 / 0.000409 GST

### S2 — High congestion
- Governance approved: true
- L3 captured revenue: 0.900000 GST
- L2 operations fee: 3.00% (0.027000 GST)
- L1 net treasury intake: 0.873000 GST
- External gross yield: 7.10% (0.061983 GST)
- Stress losses: 0.20% (0.001746 GST)
- Net yield: 0.060237 GST
- Distribution (reserve/validator/ecosystem/L2-L3): 0.012047 / 0.018071 / 0.018071 / 0.012047 GST

### S3 — Yield loss scenario
- Governance approved: true
- L3 captured revenue: 0.700000 GST
- L2 operations fee: 2.50% (0.017500 GST)
- L1 net treasury intake: 0.682500 GST
- External gross yield: 1.00% (0.006825 GST)
- Stress losses: 4.50% (0.030713 GST)
- Net yield: 0.000000 GST
- Distribution (reserve/validator/ecosystem/L2-L3): 0.000000 / 0.000000 / 0.000000 / 0.000000 GST

### S4 — Treasury drawdown event
- Governance approved: true
- L3 captured revenue: 0.400000 GST
- L2 operations fee: 2.50% (0.010000 GST)
- L1 net treasury intake: 0.390000 GST
- External gross yield: 2.80% (0.010920 GST)
- Stress losses: 12.00% (0.046800 GST)
- Net yield: 0.000000 GST
- Distribution (reserve/validator/ecosystem/L2-L3): 0.000000 / 0.000000 / 0.000000 / 0.000000 GST

### S5 — Governance rejection case
- Governance approved: false
- L3 captured revenue: 0.650000 GST
- L2 operations fee: 2.50% (0.016250 GST)
- L1 net treasury intake: 0.633750 GST
- External gross yield: 6.40% (0.000000 GST)
- Stress losses: 0.00% (0.000000 GST)
- Net yield: 0.000000 GST
- Distribution (reserve/validator/ecosystem/L2-L3): 0.000000 / 0.000000 / 0.000000 / 0.000000 GST

## Notes

- Routing constraints assumed: L3 -> L2 -> L1 only.
- Governance rejection blocks allocation (allocatableWei = 0).
- Yield redistribution follows fixed split 20/30/30/20 (reserve/validator/ecosystem/L2-L3).
