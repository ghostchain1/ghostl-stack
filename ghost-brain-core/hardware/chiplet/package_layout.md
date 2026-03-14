# GhostBrain Chiplet — Package Layout Specification

## Overview

The GhostBrain chiplet module is assembled using 2.5D silicon interposer packaging.
The package integrates:
- 1× GhostBrain Compute Chiplet die
- 8× HBM3 memory stacks (12 GB each = 96 GB total)
- 1× Silicon interposer (CoWoS or EMIB variant)
- Package substrate (BGA, 75 mm × 75 mm)

---

## Package Dimensions

| Component | Dimension |
|---|---|
| Package outline | 75 mm × 75 mm × 8.5 mm |
| Compute die | 28.5 mm × 28.0 mm (≈800 mm²) |
| HBM3 stack footprint | 7.75 mm × 11.87 mm (each) |
| Interposer | 66 mm × 66 mm |
| Ball pitch (BGA) | 1.0 mm |
| Ball count | ~5000 (signal + power + ground) |

---

## Interposer Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Package Substrate                   │
│  ┌──────────────────────────────────────────────┐    │
│  │                Silicon Interposer              │    │
│  │  ┌─────────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │    │
│  │  │         │ │HBM │ │HBM │ │HBM │ │HBM │    │    │
│  │  │ Compute │ │ 0  │ │ 1  │ │ 2  │ │ 3  │    │    │
│  │  │  Die    │ └────┘ └────┘ └────┘ └────┘    │    │
│  │  │         │ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │    │
│  │  │         │ │HBM │ │HBM │ │HBM │ │HBM │    │    │
│  │  │         │ │ 4  │ │ 5  │ │ 6  │ │ 7  │    │    │
│  │  └─────────┘ └────┘ └────┘ └────┘ └────┘    │    │
│  │  UCIe Pads (East + West edges of interposer) │    │
│  └──────────────────────────────────────────────┘    │
│  BGA balls (bottom)                                   │
└──────────────────────────────────────────────────────┘
```

---

## Interposer Routing Layers

| Layer | Function |
|---|---|
| M1–M3 | Fine-pitch signal routing (HBM ↔ Compute die) |
| M4–M6 | Power distribution network (PDN) |
| M7    | UCIe die-to-die interconnect (east/west edges) |
| Redistribution | RDL for BGA ball placement |

### HBM3 Connection
- Per HBM stack: 512-bit data bus (1024 I/Os including ECC, CMDs, CLKs)
- Total microbumps between interposer and compute die: ~10,000
- Bump pitch: 55 µm (HBM3e compatible)

### UCIe Die-to-Die
- 2 UCIe Gen3 lanes per edge (east + west), 4 total
- 800 Gb/s per lane → 3.2 Tb/s aggregate die-to-die bandwidth
- Used for multi-chiplet scale-up (rack interconnect in Phase 5)

---

## PDN (Power Delivery Network)

| Rail | Voltage | Purpose |
|---|---|---|
| VDD_CORE | 0.75 V | Compute logic |
| VDD_SRAM | 0.80 V | SRAM arrays |
| VDD_IO   | 1.2 V  | UCIe / HBM PHY |
| VDD_PLL  | 1.8 V  | PLL / analog |

**Decoupling budget:**
- On-die CDECAP: ~200 nF (deep-trench)
- Interposer MIM capacitor: 1.2 µF
- Package substrate capacitors: 8× 100 nF 0201 + 4× 10 µF 0402

---

## Thermal Interface

- Lid material: Copper (integrated heat spreader, IHS)
- TIM1 (die to IHS): Indium solder, 5 µm nominal (θ_jc ≈ 0.10 °C/W)
- TIM2 (IHS to cooler): High-conductivity graphite pad
- Reference cooler: Vapour chamber + 3× 120 mm fans (thermal resistance 0.15 °C/W)
- Junction temp at TDP (300 W, 35 °C inlet): 35 + 300×0.25 = **110 °C max**

> Cooler selection must achieve ≤0.25 °C/W total θ_ja to stay below 105 °C junction limit.

---

## Bill of Materials (Indicative)

| Item | Quantity | Notes |
|---|---|---|
| Compute die (7nm) | 1 | TSMC N7, tape-out Phase 4 |
| HBM3 stack (Samsung/SK Hynix) | 8 | 12 GB each, 3.6 TB/s total |
| Silicon interposer (CoWoS) | 1 | TSMC CoWoS-R or Intel EMIB |
| Substrate BGA 75×75 | 1 | 1.0 mm pitch, 12-layer |
| Copper IHS | 1 | Soldered lid |
| TIM1 (In solder) | 1 | Applied during assembly |

---

## Qualification & Reliability Targets

| Test | Standard | Condition |
|---|---|---|
| HTOL | JEDEC JESD22-A108 | 125 °C, 1000 h |
| Temp cycle | JESD22-A104 | -40 °C to 125 °C, 500 cycles |
| Moisture sensitivity | JEDEC J-STD-020 | MSL-2 |
| ESD | HBM 1 kV, CDM 250 V | All I/O pads |
| Latch-up | JEDEC JESD78 | 100 mA trigger |

---

## Revision History

| Rev | Date | Change |
|---|---|---|
| 0.1 | Phase 3 | Initial architecture sketch |
| 0.5 | Phase 4 | CoWoS selection, HBM3 ×8, UCIe Gen3 |
| 1.0 | Phase 4 tape-out | Final floorplan + PDN sign-off |
