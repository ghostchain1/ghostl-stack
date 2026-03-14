import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8142;

app.use(express.json());

const RISK_LEVELS = ['NORMAL', 'ELEVATED', 'HIGH', 'CRITICAL', 'CRISIS'];
const INDICATOR_CATEGORIES = ['LIQUIDITY', 'CREDIT', 'MARKET', 'CURRENCY', 'SOVEREIGN', 'SYSTEMIC'];

const state = {
  globalRiskLevel: 'NORMAL',
  indicators: new Map([
    ['GLOBAL_LIQUIDITY',    { name: 'Global Liquidity Index', category: 'LIQUIDITY', value: 100, threshold: 70, updatedAt: Date.now() }],
    ['CREDIT_SPREAD',       { name: 'Sovereign Credit Spread (bps)', category: 'CREDIT', value: 85, threshold: 300, updatedAt: Date.now() }],
    ['FX_VOLATILITY',       { name: 'FX Volatility Index', category: 'CURRENCY', value: 12, threshold: 35, updatedAt: Date.now() }],
    ['SETTLEMENT_FAILURE',  { name: 'Settlement Failure Rate (%)', category: 'SYSTEMIC', value: 0.01, threshold: 2.0, updatedAt: Date.now() }],
    ['CBDC_ADOPTION',       { name: 'CBDC Adoption Rate (%)', category: 'MARKET', value: 18, threshold: 0, updatedAt: Date.now() }],
    ['SOVEREIGN_CDS',       { name: 'Sovereign CDS Spread (bps)', category: 'SOVEREIGN', value: 45, threshold: 500, updatedAt: Date.now() }],
  ]),
  circuitBreakers: new Map(),
  crisisEvents: [],
};

const assessRisk = () => {
  const breached = Array.from(state.indicators.values())
    .filter(i => i.threshold > 0 && i.value > i.threshold).length;
  if (breached >= 4) return 'CRISIS';
  if (breached >= 3) return 'CRITICAL';
  if (breached >= 2) return 'HIGH';
  if (breached >= 1) return 'ELEVATED';
  return 'NORMAL';
};

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'gwf-monitor', riskLevel: state.globalRiskLevel }));

app.get('/risk', (req, res) => {
  const level = assessRisk();
  state.globalRiskLevel = level;
  res.json({
    globalRiskLevel: level,
    riskIndex: RISK_LEVELS.indexOf(level),
    indicators: Array.from(state.indicators.values()),
    circuitBreakers: Array.from(state.circuitBreakers.values()),
    assessedAt: Date.now(),
  });
});

app.post('/indicators/:key', (req, res) => {
  const { value, reporter } = req.body;
  const ind = state.indicators.get(req.params.key);
  if (!ind) return res.status(404).json({ error: 'unknown indicator' });
  const prev = ind.value;
  ind.value = Number(value);
  ind.updatedAt = Date.now();
  ind.lastReporter = reporter;
  const newRisk = assessRisk();
  if (newRisk !== state.globalRiskLevel) {
    console.warn(`Global risk level changed: ${state.globalRiskLevel} → ${newRisk}`);
    state.globalRiskLevel = newRisk;
  }
  res.json({ updated: true, key: req.params.key, prev, value: ind.value, globalRiskLevel: state.globalRiskLevel });
});

app.post('/circuit-breakers', (req, res) => {
  const { id, market, trigger, action } = req.body;
  if (!id || !market) return res.status(400).json({ error: 'id and market required' });
  const cb = { id, market, trigger: trigger ?? 'MANUAL', action: action ?? 'HALT_TRADING', triggeredAt: Date.now(), active: true };
  state.circuitBreakers.set(id, cb);
  console.warn(`CIRCUIT BREAKER TRIGGERED: ${id} on ${market} — ${action}`);
  res.status(201).json(cb);
});

app.delete('/circuit-breakers/:id', (req, res) => {
  const cb = state.circuitBreakers.get(req.params.id);
  if (!cb) return res.status(404).json({ error: 'not found' });
  cb.active = false;
  cb.clearedAt = Date.now();
  res.json({ cleared: true, id: req.params.id });
});

app.post('/crisis', (req, res) => {
  const { type, description, affectedMarkets, coordinator } = req.body;
  const event = { id: 'crisis-' + Date.now(), type, description, affectedMarkets, coordinator, declaredAt: Date.now(), status: 'ACTIVE' };
  state.crisisEvents.push(event);
  state.globalRiskLevel = 'CRISIS';
  console.error(`CRISIS DECLARED: ${type} — ${description}`);
  res.status(201).json(event);
});

app.get('/crisis', (req, res) =>
  res.json({ events: state.crisisEvents, active: state.crisisEvents.filter(e => e.status === 'ACTIVE') }));

app.listen(PORT, () => console.log(`GWF Monitor on :${PORT}`));
