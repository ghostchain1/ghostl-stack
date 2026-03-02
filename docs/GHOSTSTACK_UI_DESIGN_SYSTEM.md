# GhostStack UI Design System
## Component Library Specification v1.0

**Classification:** Engineering Reference  
**Status:** Production  
**Target:** Next.js 16 + Tailwind CSS + TypeScript  

---

## 1. Design Philosophy

### 1.1 Core Principles

**Command Center Aesthetic**  
Every interface element communicates operational authority. The UI is not decorative — it is a control surface for a sovereign infrastructure system.

**Institutional Precision**  
Typography is tight. Spacing is deliberate. Color is functional, not ornamental. Every pixel serves a purpose.

**Dark-First Interface**  
Phantom Black `#0B0F14` is the canonical background. Light mode is a secondary variant. The system is designed for extended operational use in low-light environments.

**Layer Identity**  
Every component that relates to a specific layer (L1/L2/L3/AI/Security) carries that layer's accent color. Layer identity is never ambiguous.

**Zero Clutter Philosophy**  
Information density is high. Decoration is zero. No gradients for aesthetics. No shadows for depth. Glows only for state communication.

---

## 2. Design Tokens

### 2.1 Color Tokens

```typescript
// tokens/colors.ts
export const colors = {
  // ── Core Brand ──────────────────────────────────────────────
  phantomBlack:   '#0B0F14',  // Primary background
  spectralPurple: '#7A5CFF',  // Primary brand, L2 accent
  ghostBlue:      '#00C2FF',  // System accent, L3 accent
  neuralTeal:     '#00F0B5',  // AI indicator, success
  sovereignGold:  '#C9A227',  // Governance, L1 accent
  signalRed:      '#FF3B3B',  // Security alerts, danger
  ghostWhite:     '#E8EDF5',  // Primary text
  phantomMist:    '#8A9BB5',  // Secondary text, muted

  // ── Layer Accents ────────────────────────────────────────────
  layer: {
    l1:  '#C9A227',  // Sovereign Gold  — GhostChain
    l2:  '#7A5CFF',  // Spectral Purple — GhostL2
    l3:  '#00C2FF',  // Ghost Blue      — GhostL3
    ai:  '#00F0B5',  // Neural Teal     — AI Systems
    sec: '#FF3B3B',  // Signal Red      — Security
  },

  // ── Layer Backgrounds (8% opacity) ──────────────────────────
  layerBg: {
    l1:  'rgba(201,162,39,0.08)',
    l2:  'rgba(122,92,255,0.08)',
    l3:  'rgba(0,194,255,0.08)',
    ai:  'rgba(0,240,181,0.08)',
    sec: 'rgba(255,59,59,0.08)',
  },

  // ── Layer Borders (20% opacity) ─────────────────────────────
  layerBorder: {
    l1:  'rgba(201,162,39,0.20)',
    l2:  'rgba(122,92,255,0.20)',
    l3:  'rgba(0,194,255,0.20)',
    ai:  'rgba(0,240,181,0.20)',
    sec: 'rgba(255,59,59,0.20)',
  },

  // ── Layer Glows (25% opacity) ────────────────────────────────
  layerGlow: {
    l1:  'rgba(201,162,39,0.25)',
    l2:  'rgba(122,92,255,0.25)',
    l3:  'rgba(0,194,255,0.25)',
    ai:  'rgba(0,240,181,0.25)',
    sec: 'rgba(255,59,59,0.25)',
  },

  // ── Surface Tokens ───────────────────────────────────────────
  surface: {
    base:   '#0B0F14',
    raised:  '#0f1520',
    overlay: '#141c2e',
    panel:   'rgba(11,15,20,0.85)',
    glass:   'rgba(255,255,255,0.03)',
  },

  // ── Border Tokens ────────────────────────────────────────────
  border: {
    default: 'rgba(122,92,255,0.15)',
    subtle:  'rgba(255,255,255,0.06)',
    strong:  'rgba(122,92,255,0.35)',
  },

  // ── Status Tokens ────────────────────────────────────────────
  status: {
    active:  '#00F0B5',
    warning: '#C9A227',
    error:   '#FF3B3B',
    muted:   '#8A9BB5',
  },
} as const;
```

### 2.2 Typography Tokens

```typescript
// tokens/typography.ts
export const typography = {
  // ── Font Families ────────────────────────────────────────────
  family: {
    display: "'Orbitron', system-ui, sans-serif",
    heading: "'Sora', system-ui, sans-serif",
    body:    "'Inter', system-ui, sans-serif",
    mono:    "'JetBrains Mono', 'Fira Code', monospace",
  },

  // ── Font Sizes ───────────────────────────────────────────────
  size: {
    '2xs': '0.6rem',    // 9.6px  — micro labels
    xs:    '0.7rem',    // 11.2px — section labels
    sm:    '0.78rem',   // 12.5px — body small
    base:  '0.875rem',  // 14px   — body
    md:    '1rem',      // 16px   — body large
    lg:    '1.125rem',  // 18px   — card titles
    xl:    '1.25rem',   // 20px   — subsection headings
    '2xl': '1.5rem',    // 24px   — section headings
    '3xl': '1.75rem',   // 28px   — page headings
    '4xl': '2.25rem',   // 36px   — display
    '5xl': '3rem',      // 48px   — hero
  },

  // ── Font Weights ─────────────────────────────────────────────
  weight: {
    regular:   400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },

  // ── Letter Spacing ───────────────────────────────────────────
  tracking: {
    tight:     '-0.01em',
    normal:    '0em',
    wide:      '0.04em',
    wider:     '0.08em',
    widest:    '0.12em',
    sovereign: '0.14em',  // Section labels, badges
  },

  // ── Line Heights ─────────────────────────────────────────────
  leading: {
    none:    1,
    tight:   1.2,
    snug:    1.4,
    normal:  1.6,
    relaxed: 1.75,
  },
} as const;
```

### 2.3 Spacing Tokens

```typescript
// tokens/spacing.ts
export const spacing = {
  0:   '0px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  8:   '32px',
  10:  '40px',
  12:  '48px',
  16:  '64px',
  20:  '80px',
  24:  '96px',
} as const;
```

### 2.4 Border Radius Tokens

```typescript
// tokens/radius.ts
export const radius = {
  none: '0px',
  xs:   '6px',
  sm:   '8px',
  md:   '10px',
  lg:   '14px',
  xl:   '18px',
  '2xl':'22px',
  full: '9999px',
} as const;
```

### 2.5 Shadow Tokens

```typescript
// tokens/shadows.ts
export const shadows = {
  card:  '0 8px 32px rgba(0,0,0,0.3)',
  panel: '0 20px 60px rgba(0,0,0,0.4)',
  glow: {
    purple: '0 0 24px rgba(122,92,255,0.35)',
    blue:   '0 0 24px rgba(0,194,255,0.35)',
    teal:   '0 0 24px rgba(0,240,181,0.35)',
    gold:   '0 0 24px rgba(201,162,39,0.35)',
    red:    '0 0 24px rgba(255,59,59,0.35)',
  },
  dot: {
    active:  '0 0 6px rgba(0,240,181,0.6)',
    warning: '0 0 6px rgba(201,162,39,0.6)',
    error:   '0 0 6px rgba(255,59,59,0.6)',
  },
} as const;
```

---

## 3. Layout System

### 3.1 Grid System

```
12-column grid
Max content width: 1280px
Gutter: 24px (desktop), 16px (tablet), 12px (mobile)
Margin: 32px (desktop), 20px (tablet), 16px (mobile)
```

### 3.2 App Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR (60px)                                              │
│  [GhostWordmark]  [Search]  [Network]  [Notifications]      │
├──────────────┬──────────────────────────────────────────────┤
│              │  STATUS STRIP (40px)                         │
│  SIDEBAR     │  [L1 ●] [L2 ●] [L3 ●] [AI ●]               │
│  (240px)     ├──────────────────────────────────────────────┤
│              │                                              │
│  [Logo]      │  MAIN CONTENT AREA                           │
│  [Nav]       │  (fluid width, scrollable)                   │
│  [Network]   │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 3.3 Page Layout Variants

**Dashboard Layout** — Full-width grid of metric cards
```
[Header]
[Status Row]
[Metric Grid: 4 columns]
[Chart Row: 2 columns]
[Table: full width]
```

**Detail Layout** — Primary content + sidebar
```
[Header]
[Primary Content: 8 cols] [Sidebar: 4 cols]
```

**Landing Layout** — Full-width sections
```
[Nav]
[Hero: full width]
[Section: max 1100px centered]
[Section: full width accent]
[Section: max 1100px centered]
[Footer]
```

---

## 4. Component Specifications

### 4.1 GhostMark / GhostWordmark

**Purpose:** Official brand mark. Used in sidebar, landing page, and all brand contexts.

```typescript
interface GhostMarkProps {
  size?: number;          // Default: 32
  glowColor?: string;     // Default: '#7A5CFF'
  variant?: 'mark-only' | 'full' | 'wordmark-only';
}

interface GhostWordmarkProps {
  size?: number;          // Default: 32
  glowColor?: string;     // Default: '#7A5CFF'
  showTagline?: boolean;  // Default: false
}
```

**Visual Spec:**
- Ghost mark: geometric ghost silhouette in hexagonal frame
- Hex frame: 1.2px stroke, layer color at 40% opacity
- Ghost body: gradient fill from layer color 90% → 60%
- Neural lines: 0.6px stroke, layer color at 35% opacity
- Wordmark: Orbitron 700, 0.12em tracking, uppercase
- Tagline: Inter 400, 0.06em tracking, phantom mist color

**Usage Rules:**
- Never distort proportions
- Never use on backgrounds lighter than #1a2030
- Minimum size: 20px mark height
- Clear space: 1× mark height on all sides

---

### 4.2 LayerBadge

**Purpose:** Layer identity chip. Used everywhere a layer needs to be identified.

```typescript
type LayerKey = 'L1' | 'L2' | 'L3' | 'AI' | 'SEC';

interface LayerBadgeProps {
  layer: LayerKey;
  showName?: boolean;   // Show full layer name
  showDot?: boolean;    // Show status dot
  size?: 'sm' | 'md';  // sm=default, md=larger
}
```

**Visual Spec:**

| Layer | Color | Background | Border |
|---|---|---|---|
| L1 | #C9A227 | rgba(201,162,39,0.12) | rgba(201,162,39,0.35) |
| L2 | #7A5CFF | rgba(122,92,255,0.12) | rgba(122,92,255,0.35) |
| L3 | #00C2FF | rgba(0,194,255,0.12) | rgba(0,194,255,0.35) |
| AI | #00F0B5 | rgba(0,240,181,0.12) | rgba(0,240,181,0.35) |
| SEC | #FF3B3B | rgba(255,59,59,0.12) | rgba(255,59,59,0.35) |

**Sizing:**
```
sm: padding 2px 8px, font-size 0.65rem, border-radius 999px
md: padding 4px 12px, font-size 0.75rem, border-radius 999px
```

**Status Dot:**
```
size: 5px × 5px
border-radius: 50%
background: layer color
box-shadow: 0 0 5px layer_color
```

---

### 4.3 SovereignCard

**Purpose:** Primary card container for all dashboard panels.

```typescript
interface SovereignCardProps {
  layer?: LayerKey;       // Optional layer accent
  title?: string;
  subtitle?: string;
  status?: 'active' | 'warning' | 'error' | 'inactive';
  accentBar?: boolean;    // Top accent bar (default: true when layer set)
  children: ReactNode;
}
```

**Visual Spec:**
```
background:    rgba(11,15,20,0.85)
border:        1px solid rgba(122,92,255,0.15)
border-radius: 14px
padding:       20px
box-shadow:    0 8px 32px rgba(0,0,0,0.3)

hover:
  transform:   translateY(-2px)
  border:      1px solid [layer_color]55
  box-shadow:  0 8px 32px rgba(0,0,0,0.3), 0 0 24px [layer_color]22

accent-bar (when layer set):
  position:    absolute top 0 left 0 right 0
  height:      2px
  background:  linear-gradient(90deg, [layer_color], transparent)
```

---

### 4.4 MetricCard

**Purpose:** Single metric display with label, value, and optional trend.

```typescript
interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    positive?: boolean;  // Is up direction positive?
  };
  layer?: LayerKey;
  status?: 'active' | 'warning' | 'error';
}
```

**Visual Spec:**
```
Label:
  font-family: Inter
  font-size:   0.7rem
  font-weight: 600
  letter-spacing: 0.14em
  text-transform: uppercase
  color: #8A9BB5

Value:
  font-family: Orbitron
  font-size:   1.5rem
  font-weight: 700
  letter-spacing: 0.04em
  color: #E8EDF5

Unit:
  font-family: Inter
  font-size:   0.75rem
  color: #8A9BB5
  margin-left: 4px

Trend (up/positive):
  color: #00F0B5
  prefix: ↑

Trend (down/negative):
  color: #FF3B3B
  prefix: ↓

Trend (flat):
  color: #8A9BB5
  prefix: →
```

---

### 4.5 StatusDot

**Purpose:** Real-time status indicator with optional pulse animation.

```typescript
interface StatusDotProps {
  status: 'active' | 'warning' | 'error' | 'inactive';
  pulse?: boolean;  // Animate for active status
  size?: 'sm' | 'md' | 'lg';
}
```

**Visual Spec:**
```
sm:  6px × 6px
md:  8px × 8px
lg:  10px × 10px

active:   background #00F0B5, box-shadow 0 0 6px rgba(0,240,181,0.6)
warning:  background #C9A227, box-shadow 0 0 6px rgba(201,162,39,0.6)
error:    background #FF3B3B, box-shadow 0 0 6px rgba(255,59,59,0.6)
inactive: background #8A9BB5, no shadow

pulse animation (active only):
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,240,181,0.4); }
    50%       { box-shadow: 0 0 0 6px rgba(0,240,181,0); }
  }
  animation: pulse-glow 2s ease-in-out infinite;
```

---

### 4.6 Button System

**Primary Button:**
```
background:    linear-gradient(135deg, #7A5CFF, #5A3CDF)
color:         #E8EDF5
border:        none
border-radius: 10px
padding:       12px 20px
font-family:   Inter
font-size:     0.82rem
font-weight:   600
letter-spacing: 0.06em

hover:
  transform:   translateY(-2px)
  box-shadow:  0 0 20px rgba(122,92,255,0.4)

active:
  transform:   translateY(0)
```

**Secondary Button:**
```
background:    rgba(255,255,255,0.05)
color:         #E8EDF5
border:        1px solid rgba(122,92,255,0.3)
border-radius: 10px
padding:       12px 20px

hover:
  background:  rgba(122,92,255,0.1)
  border:      1px solid rgba(122,92,255,0.5)
```

**Danger Button:**
```
background:    rgba(255,59,59,0.1)
color:         #FF3B3B
border:        1px solid rgba(255,59,59,0.3)
border-radius: 10px
padding:       12px 20px

hover:
  background:  rgba(255,59,59,0.2)
  border:      1px solid rgba(255,59,59,0.5)
```

**Ghost Button (text only):**
```
background:    transparent
color:         #8A9BB5
border:        none
padding:       8px 12px

hover:
  color:       #E8EDF5
```

---

### 4.7 Input System

**Text Input:**
```
background:    rgba(255,255,255,0.04)
border:        1px solid rgba(255,255,255,0.08)
border-radius: 8px
padding:       10px 14px
font-family:   Inter
font-size:     0.875rem
color:         #E8EDF5

placeholder:
  color:       #8A9BB5

focus:
  border:      1px solid rgba(122,92,255,0.5)
  box-shadow:  0 0 0 3px rgba(122,92,255,0.1)
  outline:     none

error:
  border:      1px solid rgba(255,59,59,0.5)
  box-shadow:  0 0 0 3px rgba(255,59,59,0.1)
```

**Search Input:**
```
Same as text input +
  padding-left: 36px (icon space)
  icon: search, color #8A9BB5, size 16px
```

**Select:**
```
Same as text input +
  appearance: none
  background-image: chevron-down icon
  padding-right: 36px
```

---

### 4.8 Navigation System

**Sidebar Nav Section:**
```
Section Title:
  font-family:    Inter
  font-size:      0.65rem
  font-weight:    600
  letter-spacing: 0.14em
  text-transform: uppercase
  color:          #8A9BB5
  padding:        16px 12px 6px

Nav Item:
  font-family:    Inter
  font-size:      0.82rem
  font-weight:    400
  color:          #8A9BB5
  padding:        7px 12px
  border-radius:  8px
  transition:     all 0.15s ease

  hover:
    background:   rgba(122,92,255,0.08)
    color:        #E8EDF5

  active:
    background:   rgba(122,92,255,0.12)
    color:        #7A5CFF
    font-weight:  500
    border-left:  2px solid #7A5CFF
```

**Sovereign Economy Nav Section (special):**
```
Section Title:
  color:          #C9A227  (Sovereign Gold — L1 accent)
  
Nav Items:
  active:
    color:        #C9A227
    border-left:  2px solid #C9A227
    background:   rgba(201,162,39,0.08)
```

---

### 4.9 Table System

**Data Table:**
```
Container:
  background:    rgba(11,15,20,0.85)
  border:        1px solid rgba(122,92,255,0.15)
  border-radius: 14px
  overflow:      hidden

Header Row:
  background:    rgba(255,255,255,0.03)
  border-bottom: 1px solid rgba(255,255,255,0.06)

  Header Cell:
    font-family:    Inter
    font-size:      0.65rem
    font-weight:    600
    letter-spacing: 0.14em
    text-transform: uppercase
    color:          #8A9BB5
    padding:        10px 16px

Data Row:
  border-bottom: 1px solid rgba(255,255,255,0.04)
  transition:    background 0.15s ease

  hover:
    background:  rgba(122,92,255,0.04)

  Data Cell:
    font-family: Inter
    font-size:   0.82rem
    color:       #E8EDF5
    padding:     12px 16px

Monospace Cell (addresses, hashes):
  font-family: JetBrains Mono
  font-size:   0.78rem
  color:       #8A9BB5
```

---

### 4.10 Chart System

**Line Chart:**
```
Background:    transparent
Grid lines:    rgba(255,255,255,0.04)
Axis labels:   Inter 0.65rem, #8A9BB5
Tooltip:       SovereignCard style
Line colors:   Layer accent colors
Area fill:     Layer color at 10% opacity
```

**Bar Chart:**
```
Bar colors:    Layer accent colors
Bar radius:    4px top corners
Hover:         Layer color at 80% opacity + glow
```

**Donut Chart:**
```
Segment colors: Layer accent colors
Center label:   Orbitron bold, #E8EDF5
Legend:         LayerBadge components
```

---

### 4.11 Gas Equilibrium Panel

**Purpose:** Real-time gas price monitoring and AI optimization status.

```
Layout:
  [Header: "GAS EQUILIBRIUM" + AI badge]
  [Current Gas: large Orbitron metric]
  [Target Band: min/max range indicator]
  [AI Status: "OPTIMIZING" / "STABLE" / "ADJUSTING"]
  [Trend Chart: 24h gas price line]
  [Prediction: next epoch forecast]

Colors:
  Stable:     Neural Teal #00F0B5
  Adjusting:  Sovereign Gold #C9A227
  Congested:  Signal Red #FF3B3B
```

---

### 4.12 Validator Heatmap

**Purpose:** Geographic distribution and performance visualization of validator set.

```
Layout:
  [Header: "VALIDATOR FEDERATION" + L1 badge]
  [World map with validator node markers]
  [Node marker: colored dot, size = stake weight]
  [Hover: validator card with score breakdown]
  [Legend: performance score color scale]
  [Summary: total validators, regions, avg score]

Node Colors:
  score > 0.90: Neural Teal
  score > 0.75: Sovereign Gold
  score > 0.50: Ghost Blue
  score < 0.50: Signal Red
```

---

### 4.13 Treasury Dashboard

**Purpose:** Real-time treasury state visualization.

```
Layout:
  [Header: "GHOST TREASURY" + L1 badge + solvency proof status]
  [Balance: large Orbitron metric in Sovereign Gold]
  [Allocation Donut: stable/volatile/reserve breakdown]
  [Yield Metrics: gross yield, net yield, burn rate]
  [Distribution Row: 4 metric cards for distribution split]
  [Recent Actions: table of last 10 treasury receipts]
  [Proof Status: ZK solvency proof epoch and verification]

Accent: Sovereign Gold throughout
```

---

### 4.14 Governance Voting Interface

**Purpose:** Proposal listing, voting, and execution status.

```
Layout:
  [Header: "GOVERNANCE" + L1 badge]
  [Active Proposals: card list]
  [Proposal Card:
    - Title + status badge
    - Description excerpt
    - Vote counts (for/against/abstain)
    - Progress bar (quorum threshold)
    - Timelock countdown
    - [Vote] button (if eligible)
  ]
  [Executed Proposals: table with receipt links]

Status Badges:
  ACTIVE:    Neural Teal
  PENDING:   Sovereign Gold
  EXECUTED:  Ghost Blue
  REJECTED:  Signal Red
  EXPIRED:   Phantom Mist
```

---

### 4.15 Cross-Layer Flow Visualization

**Purpose:** Real-time visualization of L3→L2→L1 fee routing.

```
Layout:
  [Header: "REVENUE FLOWS" + routing law badge]
  [Flow Diagram:
    L3 [box] → [arrow with amount] → L2 [box] → [arrow with amount] → L1 [box]
  ]
  [Flow Metrics:
    - L3 epoch revenue
    - L2 aggregation batch count
    - L1 treasury intake
    - External yield deployed
  ]
  [Recent Batches: table of recent aggregation batches]

Arrow Colors:
  L3→L2: Ghost Blue → Spectral Purple gradient
  L2→L1: Spectral Purple → Sovereign Gold gradient
```

---

### 4.16 AI Activity Monitor

**Purpose:** Real-time monitoring of all Hyper Ghost AI systems.

```
Layout:
  [Header: "HYPER GHOST AI" + AI badge]
  [AI System Grid: 6 cards, one per AI system]
  [AI System Card:
    - System name + status dot
    - Current action description
    - Last action timestamp
    - Performance metric
    - Constitutional boundary indicator
  ]
  [Recent AI Actions: table with action type, system, timestamp, outcome]

Accent: Neural Teal throughout
Constitutional boundary indicator:
  Green bar: well within bounds
  Yellow bar: approaching limit
  Red bar: at limit (action blocked)
```

---

### 4.17 Risk Indicator Panel

**Purpose:** Portfolio risk scoring and allocation risk visualization.

```
Layout:
  [Header: "RISK ORACLE" + AI badge]
  [Overall Risk Score: large gauge, 0-100]
  [Risk Breakdown:
    - Counterparty risk
    - Liquidity risk
    - Smart contract risk
    - Market risk
    - Correlation risk
  ]
  [Risk Cap Indicator: current vs constitutional cap (7200 bps)]
  [Strategy Risk Table: each active strategy with risk score]

Risk Score Colors:
  0-30:   Neural Teal (low risk)
  31-60:  Sovereign Gold (moderate risk)
  61-85:  Signal Red (high risk)
  86-100: Signal Red + pulse (critical)
```

---

## 5. Animation System

### 5.1 Motion Principles

- **Purposeful:** Every animation communicates state, not decoration
- **Fast:** Transitions ≤ 250ms for interactive elements
- **Smooth:** Ease-out for entrances, ease-in for exits
- **Subtle:** Amplitude is small; frequency is low

### 5.2 Animation Tokens

```css
/* Entry animations */
@keyframes rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Status pulse */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,240,181,0.4); }
  50%       { box-shadow: 0 0 0 6px rgba(0,240,181,0); }
}

/* Scan line (AI active indicator) */
@keyframes scan-line {
  from { transform: translateY(-100%); }
  to   { transform: translateY(100vh); }
}

/* Float (hero elements) */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-6px); }
}

/* Fade in */
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### 5.3 Transition Tokens

```css
--transition-fast:   all 0.15s ease;
--transition-base:   all 0.25s ease;
--transition-slow:   all 0.4s ease;
--transition-spring: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 6. Iconography System

### 6.1 Icon Style

- **Style:** Line icons only — no filled icons in primary UI
- **Stroke weight:** 1.5px
- **Corner radius:** 2px (sharp, not rounded)
