import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4114;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory infrastructure store ───────────────────────────────────────────────
interface InfraProject {
  id: string;
  name: string;
  nation: string;
  description: string;
  budgetGST: number;
  status: "proposed" | "active" | "completed" | "suspended";
  createdAt: number;
}
interface InfraBond {
  id: string;
  projectId: string;
  holder: string;
  faceValueGST: number;
  couponRatePercent: number;
  maturityMs: number;
  issuedAt: number;
}

const projects = new Map<string, InfraProject>();
const bonds    = new Map<string, InfraBond>();

// Seed one genesis project
projects.set("proj-genesis", {
  id: "proj-genesis", name: "GhostChain L2 Bridge Expansion", nation: "ghostchain",
  description: "Expand L1<>L2 bridge throughput", budgetGST: 5_000_000,
  status: "active", createdAt: Date.now(),
});

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-infra", ts: Date.now() });
});

app.get("/projects", (req, res) => {
  const nation = req.query.nation as string | undefined;
  let list = [...projects.values()];
  if (nation) list = list.filter(p => p.nation === nation);
  res.json({ projects: list, total: list.length });
});

app.post("/projects/create", (req, res) => {
  const { name, nation, description, budgetGST } = req.body as Partial<InfraProject>;
  if (!name || !nation || !description || budgetGST === undefined) {
    res.status(400).json({ error: "name, nation, description and budgetGST are required" });
    return;
  }
  const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const project: InfraProject = { id, name, nation, description, budgetGST, status: "proposed", createdAt: Date.now() };
  projects.set(id, project);
  log.info("infra.project.created", { id, name, nation });
  res.status(201).json({ project });
});

app.post("/bonds/issue", (req, res) => {
  const { projectId, holder, faceValueGST, couponRatePercent, maturityDays } = req.body as {
    projectId?: string; holder?: string; faceValueGST?: number; couponRatePercent?: number; maturityDays?: number;
  };
  if (!projectId || !holder || faceValueGST === undefined || couponRatePercent === undefined || !maturityDays) {
    res.status(400).json({ error: "projectId, holder, faceValueGST, couponRatePercent and maturityDays are required" });
    return;
  }
  if (!projects.has(projectId)) { res.status(404).json({ error: "project not found" }); return; }
  const id = `bond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const bond: InfraBond = {
    id, projectId, holder, faceValueGST, couponRatePercent,
    maturityMs: Date.now() + maturityDays * 86_400_000,
    issuedAt: Date.now(),
  };
  bonds.set(id, bond);
  log.info("infra.bond.issued", { id, projectId, holder, faceValueGST });
  res.status(201).json({ bond });
});

app.get("/bonds/:holder", (req, res) => {
  const holderBonds = [...bonds.values()].filter(b => b.holder === req.params.holder);
  res.json({ holder: req.params.holder, bonds: holderBonds, total: holderBonds.length });
});


app.listen(PORT, () => log.info(`gse-infra listening :${PORT}`));
export default app;
