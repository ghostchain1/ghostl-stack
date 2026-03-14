import express from "express";
import { buildPolicyConfig, scoreTransaction, validateCascadingFinality } from "./lib/policy.js";
import { hashObject } from "./lib/determinism.js";
import { buildProposal } from "./lib/proposer.js";
import { buildEvidencePack } from "./lib/evidence.js";
import type { CascadingContext, TxCandidate } from "./lib/types.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 7715);
const policy = buildPolicyConfig();
const policyHash = hashObject(policy);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ghost-ai-consensus", policyHash });
});

app.get("/policy", (_req, res) => {
  res.json({ policy, policyHash });
});

app.post("/score", (req, res) => {
  const tx = req.body?.tx as TxCandidate;
  const context = (req.body?.context || { layer: "L2" }) as CascadingContext;
  if (!tx || !tx.hash || !tx.from || !tx.to) {
    res.status(400).json({ error: "invalid_tx" });
    return;
  }
  const result = scoreTransaction(tx, context, policy, policyHash);
  res.json(result);
});

app.post("/validate-cascading-finality", (req, res) => {
  const context = req.body?.context as CascadingContext;
  if (!context || !context.layer) {
    res.status(400).json({ error: "invalid_context" });
    return;
  }
  const violations = validateCascadingFinality(context);
  res.json({
    ok: violations.length === 0,
    violations,
    contextHash: hashObject(context),
    policyHash
  });
});

app.post("/propose-block", (req, res) => {
  const txs = (req.body?.txs || []) as TxCandidate[];
  const contextByTxHash = (req.body?.contextByTxHash || {}) as Record<string, CascadingContext>;
  const maxBlockGas = Number(req.body?.maxBlockGas || 30_000_000);
  const proposal = buildProposal({ txs, contextByTxHash, maxBlockGas }, policy, policyHash);
  res.json(proposal);
});

app.post("/evidence-pack", (req, res) => {
  const payload = req.body || {};
  const pack = buildEvidencePack(
    {
      kind: payload.kind || "consensus_violation",
      source: payload.source || "ghost-ai-consensus",
      rule: payload.rule || "unknown",
      context: payload.context || {},
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
      timestamp: payload.timestamp
    },
    policyHash
  );
  res.json(pack);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ghost-ai-consensus] listening on ${port}`);
});
