import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4301;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory governance store ─────────────────────────────────────────────
type ProposalStatus = "pending" | "active" | "passed" | "rejected" | "executed" | "cancelled";
interface Vote { voter: string; support: boolean; weight: number; ts: number; }
interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: ProposalStatus;
  votes: Vote[];
  quorum: number;
  createdAt: number;
  executedAt?: number;
  calldata?: string;
  targetChain?: string;
}

const proposals = new Map<string, Proposal>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-governance", ts: Date.now() });
});

app.get("/proposals", (req, res) => {
  const status = req.query.status as string | undefined;
  let list = [...proposals.values()];
  if (status) list = list.filter(p => p.status === status);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ proposals: list, total: list.length });
});

app.get("/proposals/:id", (req, res) => {
  const p = proposals.get(req.params.id);
  if (!p) { res.status(404).json({ error: "proposal not found" }); return; }
  const yea = p.votes.filter(v => v.support).reduce((s, v) => s + v.weight, 0);
  const nay = p.votes.filter(v => !v.support).reduce((s, v) => s + v.weight, 0);
  res.json({ proposal: p, tally: { yea, nay, total: yea + nay, quorum: p.quorum, quorumMet: (yea + nay) >= p.quorum } });
});

app.post("/proposals", (req, res) => {
  const { title, description, proposer, calldata, targetChain, quorum } =
    req.body as Partial<Proposal & { quorum?: number }>;
  if (!title || !description || !proposer) {
    res.status(400).json({ error: "title, description and proposer are required" });
    return;
  }
  const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const proposal: Proposal = {
    id, title, description, proposer: proposer as string,
    status: "pending", votes: [], quorum: quorum ?? 3,
    createdAt: Date.now(), calldata, targetChain,
  };
  proposals.set(id, proposal);
  log.info("proposal.created", { id, proposer, title });
  res.status(201).json({ proposal });
});

app.post("/proposals/:id/vote", (req, res) => {
  const p = proposals.get(req.params.id);
  if (!p) { res.status(404).json({ error: "proposal not found" }); return; }
  if (p.status !== "active" && p.status !== "pending") {
    res.status(409).json({ error: `Cannot vote on proposal in status '${p.status}'` });
    return;
  }
  const { voter, support, weight } = req.body as { voter?: string; support?: boolean; weight?: number };
  if (!voter || support === undefined) {
    res.status(400).json({ error: "voter and support are required" });
    return;
  }
  // Remove previous vote from same voter
  p.votes = p.votes.filter(v => v.voter !== voter);
  p.votes.push({ voter, support, weight: weight ?? 1, ts: Date.now() });
  p.status = "active";
  const yea = p.votes.filter(v => v.support).reduce((s, v) => s + v.weight, 0);
  const nay = p.votes.filter(v => !v.support).reduce((s, v) => s + v.weight, 0);
  // Auto-resolve if quorum met
  if (yea + nay >= p.quorum) {
    p.status = yea > nay ? "passed" : "rejected";
  }
  log.info("proposal.vote", { id: p.id, voter, support, newStatus: p.status });
  res.json({ proposal: p, tally: { yea, nay } });
});

app.post("/proposals/:id/execute", (req, res) => {
  const p = proposals.get(req.params.id);
  if (!p) { res.status(404).json({ error: "proposal not found" }); return; }
  if (p.status !== "passed") {
    res.status(409).json({ error: `Proposal must be in 'passed' status to execute (current: '${p.status}')` });
    return;
  }
  p.status = "executed";
  p.executedAt = Date.now();
  log.info("proposal.executed", { id: p.id });
  res.json({ proposal: p, executedAt: p.executedAt });
});


app.listen(PORT, () => log.info(`gsa-governance listening :${PORT}`));
export default app;
