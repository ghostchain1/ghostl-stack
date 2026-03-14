#!/usr/bin/env node
import express from "express";

const PORT = process.env.PORT || 9090;
const app = express();
app.use(express.json({ limit: "2mb" }));

// Very simple mock model: compute risk from tx value (if present) and data length.
app.post("/", (req, res) => {
  const body = req.body || {};
  let risk = 0;
  let reason = "model_allow";

  const tx = body.tx || body.proposal || {};
  const valueEth = tx.value ? Number(tx.value) : 0;
  const dataLen = tx.dataLength || 0;

  if (valueEth >= 5) {
    risk += 50;
    reason = "model_high_value";
  }
  if (dataLen > 10000) {
    risk += 25;
    reason = "model_large_calldata";
  }

  res.json({ risk, reason });
});

app.listen(PORT, () => {
  console.log(`[mock-model] listening on ${PORT}`);
});
