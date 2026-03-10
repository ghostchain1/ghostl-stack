# GhostBrain Chiplet — Power Delivery Specification

## Overview

Stable, low-noise power delivery is critical for maintaining predictable
inference latency and preventing false Vmin violations in GhostBrain's
high-frequency (4 GHz) tensor core array.

This document covers:
1. Power domains and rail specifications
2. Regulator topology and sequencing
3. On-package PDN impedance budget
4. Transient droop analysis
5. DVFS operating points

---

## Power Domain Map

```
Board 12V / 48V
    │
    ├── VR0: VDD_CORE  (12V → 0.75 V, 300 A)  [Tensor + Sparse Cores]
    ├── VR1: VDD_SRAM  (12V → 0.80 V, 60 A)   [SRAM arrays]
    ├── VR2: VDD_IO    (12V → 1.2 V,  20 A)   [UCIe / HBM PHY]
    ├── VR3: VDD_PLL   ( 5V → 1.8 V,   5 A)   [PLL, sensor]
    └── VR4: VDD_HBM   (12V → 1.1 V,  48 A)   [HBM3 DRAM core]
```

---

## Rail Specifications

| Rail | Nom. Voltage | Tolerance | Max Current | Load Regulation |
|---|---|---|---|---|
| VDD_CORE | 0.750 V | ±15 mV | 300 A | < 5 mV |
| VDD_SRAM | 0.800 V | ±20 mV | 60 A  | < 8 mV |
| VDD_IO   | 1.200 V | ±30 mV | 20 A  | < 10 mV |
| VDD_PLL  | 1.800 V | ±50 mV | 5 A   | < 12 mV |
| VDD_HBM  | 1.100 V | ±25 mV | 48 A  | < 8 mV |

---

## Regulator Topology

### VDD_CORE (Primary Rail)
- **Type:** Multi-phase synchronous buck, 8 phases
- **Converter:** Custom ASIC-integrated digital PWM (Renesas RAA228000 class)
- **Switching frequency:** 2 MHz per phase
- **Efficiency target:** ≥92% at 240 A load (80% TDP)
- **Output inductors:** 4× 150 nH ferrite (per phase pair), DCR < 0.3 mΩ
- **Output caps:** 20× 220 µF POSCAP + 100× 100 µF MLCC (X7R)

### VDD_SRAM, VDD_IO, VDD_PLL
- **Type:** 2-phase synchronous buck
- **Switching frequency:** 1 MHz per phase

### VDD_HBM
- **Type:** 4-phase buckwith HBM-specific transient suppression
- **Note:** HBM3 standard requires < 50 mV transient on 1.1 V rail

---

## Sequencing Order

All rails must follow this strict power-on sequence to prevent latch-up:

```
1. VDD_IO   (1.2 V) — enable, wait 5 ms
2. VDD_HBM  (1.1 V) — enable, wait 5 ms
3. VDD_PLL  (1.8 V) — enable, wait 2 ms
4. VDD_SRAM (0.8 V) — enable, wait 2 ms
5. VDD_CORE (0.75V) — ramp 50 mV/ms to Vnom
6. PLL lock — wait PLLlocked=1, timeout 1 ms
7. Release from reset
```

Power-off sequence is strictly reversed (7 → 1).

---

## PDN Impedance Budget

Target: Z_PDN < 0.5 mΩ from 100 kHz to 500 MHz (VDD_CORE).

| Frequency Range | Dominant Element | Target Z |
|---|---|---|
| DC – 1 kHz | Regulator loop | < 0.1 mΩ |
| 1 kHz – 1 MHz | PCB / substrate bulk caps | < 0.3 mΩ |
| 1 MHz – 100 MHz | Package / on-die CDECAP | < 0.5 mΩ |
| 100 MHz – 500 MHz | On-die deep-trench caps | < 1.0 mΩ |

---

## Transient Droop Analysis

Worst-case power step: all 16 tensor cores transition from idle to peak FP16
simultaneously (ΔI ≈ 200 A in < 1 ns at L1 SRAM boundary).

**Droop estimate:**

$$\Delta V_{droop} = L_{pkg} \cdot \frac{dI}{dt} = 200 \text{ pH} \times \frac{200 \text{ A}}{1 \text{ ns}} = 40 \text{ mV}$$

With 200 pH package inductance and 1 ns current rise.

**Mitigation:**
1. Deep-trench on-die CDECAP: 200 nF → supplies first 200 ps
2. Interposer MIM caps: 1.2 µF → covers 200 ps – 2 ns window
3. Package bulk caps: 10 µF → covers 2 ns – 200 ns window
4. Regulator responds: 5 µs loop bandwidth

Target: < 15 mV residual droop at nominal Vdd (within ±15 mV tolerance).

---

## DVFS Operating Points

The PCU (Power Control Unit) selects from 8 operating points based on
thermal headroom and governance workload priority.

| OPP | VDD_CORE | Freq | Peak TOPS | Power Est. |
|---|---|---|---|---|
| 0 (idle) | 0.60 V | 0.5 GHz | 64 | 15 W |
| 1 | 0.65 V | 1.0 GHz | 128 | 40 W |
| 2 | 0.68 V | 1.5 GHz | 192 | 70 W |
| 3 | 0.70 V | 2.0 GHz | 256 | 110 W |
| 4 | 0.72 V | 2.5 GHz | 320 | 155 W |
| 5 | 0.74 V | 3.0 GHz | 384 | 200 W |
| 6 | 0.75 V | 3.5 GHz | 448 | 255 W |
| 7 (max) | 0.75 V | 4.0 GHz | 512 | 300 W |

**Governance-priority override:** When GhostChain governance kernels are
scheduled (priority ≥ 100), the PCU is locked to OPP 7 for guaranteed
maximum throughput, overriding any thermal throttle < 95 °C junction temp.

---

## Measurement & Validation

| Test | Tool | Target |
|---|---|---|
| Static droop | Oscilloscope @ die pad | < 15 mV |
| Transient droop | 500 MHz BW probe | < 40 mV peak |
| PDN impedance | VNA (vector network analyser) | Z < 0.5 mΩ to 500 MHz |
| Thermal-power co-sim | ANSYS SIwave + Icepak | < 105 °C Tj at TDP |
| DVFS transition | Logic analyser + power supply | Settling < 100 µs |
