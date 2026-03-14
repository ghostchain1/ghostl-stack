/**
 * GhostStack — shared data fetching hooks
 */

const SCP = process.env.NEXT_PUBLIC_SCP_URL ?? "http://localhost:9500";
const AIM = process.env.NEXT_PUBLIC_AIM_URL ?? "http://localhost:9950";

export interface ServiceHealth {
  name:      string;
  url:       string;
  reachable: boolean;
  status:    string;
  latencyMs: number;
}

export interface ScpHealth {
  status:        string;
  emergencyStop: boolean;
  cycleCount:    number;
  uptime:        number;
}

export interface ScpStats {
  commandsRouted: number;
  cycleCount:     number;
  governance:     { total: number; pending: number };
  security:       { totalRequests: number; blocked: number };
}

export async function fetchScpHealth(): Promise<ScpHealth | null> {
  try {
    const r = await fetch(`${SCP}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchScpStats(): Promise<ScpStats | null> {
  try {
    const r = await fetch(`${SCP}/stats`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAIStatus(): Promise<ServiceHealth[] | null> {
  try {
    const r = await fetch(`${SCP}/ai/status`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.services ?? null;
  } catch { return null; }
}

export async function fetchInfraState() {
  try {
    const r = await fetch(`${SCP}/infrastructure/state`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGovernanceProposals() {
  try {
    const r = await fetch(`${SCP}/governance/proposals`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── AIM (Autonomous Infrastructure Manager — port 9950) ───────────────────────

export interface AimHealth {
  status:       string;
  port:         number;
  uptime:       number;
  cycleCount:   number;
  globalAction: string;
  summary:      string;
}

export interface AimTelemetry {
  timestamp:       string;
  hostCpuPct:      number;
  hostCpuLoadAvg:  [number, number, number];
  hostMemTotalMb:  number;
  hostMemFreeMb:   number;
  hostMemUsedPct:  number;
  hostDiskFreeGb:  number;
  vmCount:         number;
  containerCount:  number;
  networkRxBps:    number;
  networkTxBps:    number;
  vms:             Array<{ name: string; state: string; cpuPct: number | null; memPct: number | null; memMb: number; vcpus: number }>;
}

export interface AimAllocationPlan {
  timestamp:      string;
  hostCpuPct:     number;
  hostMemPct:     number;
  globalAction:   string;
  summary:        string;
  vmAllocations:  Array<{ vmName: string; action: string; reason: string; currentCpuPct: number; currentMemPct: number }>;
}

export interface AimRpcNode {
  url:       string;
  region:    string;
  load:      number;
  healthy:   boolean;
  latencyMs?: number;
}

export interface AimCloudNode {
  id:        string;
  provider:  string;
  region:    string;
  role:      string;
  ip?:       string;
  status:    string;
  createdAt: string;
}

export async function fetchAimHealth(): Promise<AimHealth | null> {
  try {
    const r = await fetch(`${AIM}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimTelemetry(): Promise<AimTelemetry | null> {
  try {
    const r = await fetch(`${AIM}/telemetry`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimAllocations(): Promise<AimAllocationPlan | null> {
  try {
    const r = await fetch(`${AIM}/allocations`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimRpcNodes(): Promise<AimRpcNode[] | null> {
  try {
    const r = await fetch(`${AIM}/rpc-nodes`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimCloudNodes(): Promise<AimCloudNode[] | null> {
  try {
    const r = await fetch(`${AIM}/cloud/nodes`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── TDS (Threat Defense System — port 9960) ───────────────────────────────────

const TDS = process.env.NEXT_PUBLIC_TDS_URL ?? "http://localhost:9960";

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface TdsHealth {
  status:      string;
  port:        number;
  uptime:      number;
  cycleCount:  number;
  threatLevel: ThreatLevel;
}

export interface TdsAlert {
  type:      string;
  severity:  string;
  sourceIp?: string;
  user?:     string;
  message:   string;
  count:     number;
  ts:        string;
}

export interface TdsChainThreat {
  type:     string;
  chain:    string;
  severity: string;
  detail:   string;
  ts:       string;
}

export interface TdsAnomaly {
  metric:    string;
  source:    string;
  value:     number;
  baseline:  number;
  zScore:    number;
  severity:  string;
  detail:    string;
  ts:        string;
}

export interface TdsIncident {
  id:          string;
  threat:      { type: string; target?: string; source: string; ts: string };
  actions:     string[];
  status:      string;
  ts:          string;
  resolvedAt?: string;
}

export interface TdsFirewallRule {
  ip:        string;
  action:    string;
  reason:    string;
  createdAt: string;
}

export interface TdsStatus {
  cycleCount:   number;
  threatLevel:  ThreatLevel;
  alerts:       TdsAlert[];
  chainThreats: TdsChainThreat[];
  anomalies:    TdsAnomaly[];
  incidents:    TdsIncident[];
  blockedIps:   TdsFirewallRule[];
  firewall:     { totalBlocked: number; totalRequests: number; autoBlocked: number; manualBlocked: number };
}

export async function fetchTdsHealth(): Promise<TdsHealth | null> {
  try {
    const r = await fetch(`${TDS}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchTdsStatus(): Promise<TdsStatus | null> {
  try {
    const r = await fetch(`${TDS}/status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchTdsIncidents(): Promise<TdsIncident[] | null> {
  try {
    const r = await fetch(`${TDS}/incidents`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── ACGE — Autonomous Compliance & Governance Engine (9970) ──────────────────

const ACGE = process.env["NEXT_PUBLIC_ACGE_URL"] ?? "http://localhost:9970";

export type KycStatus     = "pending" | "verified" | "rejected" | "expired";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type ProposalStatus = "pending" | "voting" | "approved" | "rejected" | "executed" | "expired";
export type VoteChoice     = "yes" | "no" | "abstain";

export interface AcgeIdentityRecord {
  walletAddress:   string;
  userId:          string;
  kycStatus:       KycStatus;
  kycProvider:     string;
  jurisdiction:    string;
  sanctioned:      boolean;
  riskScore:       number;
  verifiedAt?:     number;
  expiresAt?:      number;
  rejectionReason?: string;
  updatedAt:       number;
}

export interface AcgeComplianceAlert {
  id:            string;
  type:          string;
  walletAddress: string;
  txHash?:       string;
  amount?:       string;   // bigint serialized as string
  detail:        string;
  severity:      AlertSeverity;
  reported:      boolean;
  ts:            number;
}

export interface AcgeGovernanceVote {
  voter:  string;
  choice: VoteChoice;
  weight: number;
  ts:     number;
}

export interface AcgeProposal {
  id:             string;
  type:           string;
  title:          string;
  description:    string;
  proposer:       string;
  status:         ProposalStatus;
  quorumRequired: number;
  votes:          AcgeGovernanceVote[];
  voteYes:        number;
  voteNo:         number;
  voteAbstain:    number;
  totalWeight:    number;
  createdAt:      number;
  votingDeadline: number;
  executedAt?:    number;
}

export interface AcgeAuditEvent {
  id:       string;
  category: string;
  actor:    string;
  action:   string;
  details:  Record<string, unknown>;
  status:   string;
  hash:     string;
  prevHash: string;
  ts:       number;
}

export interface AcgeRegulation {
  id:           string;
  jurisdiction: string;
  category:     string;
  title:        string;
  description:  string;
  threshold?:   string;
  rule:         string;
  source:       string;
  active:       boolean;
}

export interface AcgeHealth {
  status:     string;
  service:    string;
  port:       number;
  uptime:     number;
  cycleCount: number;
  identity:   { total: number; verified: number; pending: number; rejected: number; expired: number; sanctioned: number };
  compliance: { totalAlerts: number; unreported: number; bySeverity: Record<string, number>; mixersTracked: number };
  governance: { active: number; voting: number; approved: number; rejected: number; expired: number; executed: number; quorums: Record<string, number> };
  audit:      { totalInMemory: number; ringCapacity: number; lastHash: string; sequenceNumber: number };
  regulatory: { totalRegulations: number; activeRegulations: number; sanctionedAddresses: number; jurisdictions: Record<string, number> };
}

export async function fetchAcgeHealth(): Promise<AcgeHealth | null> {
  try {
    const r = await fetch(`${ACGE}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAcgeAlerts(): Promise<AcgeComplianceAlert[] | null> {
  try {
    const r = await fetch(`${ACGE}/compliance/alerts?limit=50`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAcgeProposals(): Promise<AcgeProposal[] | null> {
  try {
    const r = await fetch(`${ACGE}/proposals`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAcgeAudit(limit = 50): Promise<AcgeAuditEvent[] | null> {
  try {
    const r = await fetch(`${ACGE}/audit?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAcgeIdentities(): Promise<AcgeIdentityRecord[] | null> {
  try {
    const r = await fetch(`${ACGE}/identities`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAcgeRegulations(): Promise<AcgeRegulation[] | null> {
  try {
    const r = await fetch(`${ACGE}/regulations`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Intelligence Network (GIN) — port 9980
// ─────────────────────────────────────────────────────────────────────────────

const GIN = process.env["NEXT_PUBLIC_GIN_URL"] ?? "http://localhost:9980";

export type NodeRole      = "hypervisor" | "vm" | "validator" | "rpc" | "cloud" | "analytics";
export type NodeStatus    = "online" | "offline" | "degraded";
export type DecisionType  = "infra_scaling" | "security_response" | "protocol_upgrade" | "governance" | "emergency_shutdown";
export type DecisionStatus = "pending" | "voting" | "approved" | "rejected" | "executed";
export type TaskType      = "code_repair" | "security_analysis" | "infra_optimization" | "economic_simulation" | "threat_response" | "cross_chain_monitoring" | "data_collection";
export type TaskPriority  = "emergency" | "high" | "normal" | "low";
export type TaskStatus    = "pending" | "assigned" | "in_progress" | "completed" | "failed";
export type ChainStatus   = "operational" | "degraded" | "congested" | "unknown";

export interface GinNode {
  id:           string;
  region:       string;
  role:         NodeRole;
  capabilities: string[];
  status:       NodeStatus;
  latencyMs:    number;
  lastSeen:     number;
  baseUrl?:     string;
  version?:     string;
  metadata:     Record<string, unknown>;
  registeredAt: number;
}

export interface GinKnowledgeItem {
  id:       string;
  source:   string;
  origin:   string;
  region:   string;
  severity: string;
  data:     Record<string, unknown>;
  ts:       number;
}

export interface GinDecision {
  id:          string;
  type:        DecisionType;
  title:       string;
  description: string;
  proposer:    string;
  quorum:      number;
  status:      DecisionStatus;
  votes:       { nodeId: string; choice: string; ts: number }[];
  deadline:    number;
  payload:     Record<string, unknown>;
  result?:     Record<string, unknown>;
  createdAt:   number;
  executedAt?: number;
}

export interface GinSwarmTask {
  id:                 string;
  type:               TaskType;
  priority:           TaskPriority;
  status:             TaskStatus;
  assignedNode?:      string;
  requiredCapability: string;
  payload:            Record<string, unknown>;
  result?:            Record<string, unknown>;
  failReason?:        string;
  createdAt:          number;
  assignedAt?:        number;
  completedAt?:       number;
  retryCount:         number;
}

export interface GinChainMetric {
  chain:          string;
  status:         ChainStatus;
  blockHeight?:   number;
  tps?:           number;
  gasPriceGwei?:  number;
  latencyMs:      number;
  ts:             number;
  error?:         string;
}

export interface GinHealth {
  status:     string;
  service:    string;
  port:       number;
  uptime:     number;
  cycleCount: number;
  self:       string;
  wsClients:  number;
  nodes:      { total: number; online: number; offline: number; degraded: number; byRole: Record<string, number>; byRegion: Record<string, number> };
  knowledge:  { totalItems: number; ringCapacity: number; bySeverity: Record<string, number>; bySource: Record<string, number>; lastPropagatedAt: number };
  decisions:  { total: number; active: number; approved: number; rejected: number; executed: number };
  swarm:      { totalTasks: number; pending: number; assigned: number; inProgress: number; completed: number; failed: number };
  telemetry:  { currentLoad1: number; currentMemUsedPct: number; chainStatuses: Record<string, string>; historyDepth: number; lastPushedAt: number };
}

export async function fetchGinHealth(): Promise<GinHealth | null> {
  try {
    const r = await fetch(`${GIN}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGinNodes(): Promise<GinNode[] | null> {
  try {
    const r = await fetch(`${GIN}/nodes`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGinKnowledge(limit = 30): Promise<GinKnowledgeItem[] | null> {
  try {
    const r = await fetch(`${GIN}/knowledge?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGinDecisions(): Promise<GinDecision[] | null> {
  try {
    const r = await fetch(`${GIN}/decisions`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGinSwarmTasks(limit = 30): Promise<GinSwarmTask[] | null> {
  try {
    const r = await fetch(`${GIN}/swarm/tasks`, { cache: "no-store" });
    return r.ok ? (r.json() as Promise<GinSwarmTask[]>).then(t => t.slice(0, limit)) : null;
  } catch { return null; }
}

export async function fetchGinChainMetrics(): Promise<GinChainMetric[] | null> {
  try {
    const r = await fetch(`${GIN}/telemetry/chains?limit=5`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── SEE — Self-Evolution Engine (9250) ───────────────────────────────────────

const SEE = process.env["NEXT_PUBLIC_SEE_URL"] ?? "http://localhost:9250";

export interface SeeCodeFinding {
  id:            string;
  file:          string;
  line?:         number;
  type:          "security" | "performance" | "dependency" | "config_drift" | "architecture";
  severity:      "critical" | "warning" | "info";
  description:   string;
  suggestion:    string;
  estimatedGain: string;
}

export interface SeeCodeAnalysisReport {
  filesScanned:  number;
  findings:      SeeCodeFinding[];
  overallScore:  number;
  byType:        Record<string, number>;
  bySeverity:    Record<string, number>;
  scannedAt:     number;
  cachedAt?:     number;
}

export interface SeeRefactorProposal {
  id:              string;
  category:        string;
  impact:          "low" | "medium" | "high" | "critical";
  title:           string;
  description:     string;
  targetFiles:     string[];
  priority:        number;
  requiresSandbox: boolean;
  status:          "draft" | "sandbox_queued" | "sandbox_passed" | "sandbox_failed" | "promoted" | "rejected";
  createdAt:       number;
}

export interface SeeArchitectureProposal {
  id:               string;
  type:             string;
  title:            string;
  description:      string;
  affectedServices: string[];
  effort:           "low" | "medium" | "high";
  priority:         number;
  createdAt:        number;
}

export interface SeeTopologyFindings {
  healthMap:     Array<{ name: string; reachable: boolean; responseMs: number | null }>;
  avgResponseMs: number;
  unreachable:   string[];
  missingHealth: string[];
  proposals:     SeeArchitectureProposal[];
  analyzedAt:    number;
}

export interface SeeEvolutionCycle {
  cycleId:      string;
  startedAt:    string;
  completedAt?: string;
  status:       "running" | "completed" | "failed";
  error?:       string;
  executions:   Array<{ proposalId?: string; status: string; timestamp?: string }>;
}

export interface SeePromotionRecord {
  id:          string;
  proposalId:  string;
  status:      string;
  reason:      string;
  promotedBy:  "auto" | "manual";
  notifiedGin: boolean;
  auditLogged: boolean;
  createdAt:   number;
  completedAt?: number;
}

export async function fetchSeeHealth(): Promise<{ status: string; cycle: number } | null> {
  try {
    const r = await fetch(`${SEE}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchSeeLatestCycle(): Promise<SeeEvolutionCycle | null> {
  try {
    const r = await fetch(`${SEE}/cycle/latest`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchSeeCodeAnalysis(): Promise<SeeCodeAnalysisReport | null> {
  try {
    const r = await fetch(`${SEE}/code-analysis`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchSeeRefactorProposals(): Promise<{ proposals: SeeRefactorProposal[]; summary: Record<string, unknown> } | null> {
  try {
    const r = await fetch(`${SEE}/refactor/proposals`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchSeeTopology(): Promise<SeeTopologyFindings | null> {
  try {
    const r = await fetch(`${SEE}/architecture/topology`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchSeePromotions(): Promise<SeePromotionRecord[] | null> {
  try {
    const r = await fetch(`${SEE}/promotions`, { cache: "no-store" });
    if (!r.ok) return null;
    const body = (await r.json()) as { promotions: SeePromotionRecord[] };
    return body.promotions;
  } catch { return null; }
}

// ── Sovereign Core Kernel (SCK) — port 9300 ──────────────────────────
const KERNEL = process.env["NEXT_PUBLIC_KERNEL_URL"] ?? "http://localhost:9300";

export type KernelTaskPriority = "emergency" | "critical" | "high" | "normal" | "low";
export type KernelTaskCategory =
  | "security_analysis" | "code_evolution" | "infra_optimization" | "telemetry_processing"
  | "governance_action" | "resource_rebalance" | "service_restart" | "knowledge_sync"
  | "supervisor_sweep" | "batch_inference" | "policy_update" | "emergency_response";
export type KernelTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "expired";

export interface KernelTask {
  id: string;
  category: KernelTaskCategory;
  title: string;
  priority: KernelTaskPriority;
  status: KernelTaskStatus;
  submittedBy: string;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  targetUrl?: string;
}

export interface KernelSchedulerStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  expired: number;
  totalSubmitted: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}

export type ResourceLevel = "ok" | "warning" | "critical";

export interface KernelResourceSnapshot {
  timestamp: number;
  overallLevel: ResourceLevel;
  alerts: string[];
  cpu: { usagePercent: number; level: ResourceLevel };
  memory: { totalMb: number; usedMb: number; usagePercent: number; level: ResourceLevel };
  disk: Array<{ path: string; totalKb: number; usedKb: number; usagePercent: number; level: ResourceLevel }>;
}

export type KernelServiceStatus = "healthy" | "degraded" | "down" | "unknown";

export interface KernelServiceEntry {
  name: string;
  url: string;
  status: KernelServiceStatus;
  lastChecked: number;
  consecutiveFailures: number;
  restartCount: number;
  critical: boolean;
}

export interface KernelSupervisorSummary {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  critical_down: number;
  total_restarts: number;
}

export type AgentRole = "observer" | "operator" | "admin" | "sovereign";

export interface KernelSecurityAgent {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  active: boolean;
  registeredAt: number;
  lastSeenAt: number;
}

export interface KernelAuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  allowed: boolean;
  severity: "info" | "warning" | "critical";
  reason?: string;
}

export interface KernelBusStatus {
  running: boolean;
  publishCount: number;
  subscriberCount: number;
  remoteSubscriberCount: number;
  deadLetterCount: number;
  recentEventCount: number;
  topics: string[];
}

export interface KernelBusEvent {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  source: string;
  timestamp: number;
}

export async function fetchKernelHealth(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${KERNEL}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelTelemetry(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${KERNEL}/telemetry`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelTasks(status?: string): Promise<{ tasks: KernelTask[]; stats: KernelSchedulerStats } | null> {
  try {
    const q = status ? `?status=${status}` : "";
    const r = await fetch(`${KERNEL}/scheduler/tasks${q}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelResources(): Promise<KernelResourceSnapshot | null> {
  try {
    const r = await fetch(`${KERNEL}/resources`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelServices(): Promise<{ services: KernelServiceEntry[]; summary: KernelSupervisorSummary } | null> {
  try {
    const r = await fetch(`${KERNEL}/supervisor/services`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelAgents(): Promise<{ agents: KernelSecurityAgent[] } | null> {
  try {
    const r = await fetch(`${KERNEL}/sck/agents`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelAudit(limit = 50): Promise<{ entries: KernelAuditEntry[] } | null> {
  try {
    const r = await fetch(`${KERNEL}/sck/audit?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelBusStatus(): Promise<KernelBusStatus | null> {
  try {
    const r = await fetch(`${KERNEL}/bus/status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchKernelBusEvents(topic?: string, limit = 50): Promise<{ events: KernelBusEvent[] } | null> {
  try {
    const q = new URLSearchParams();
    if (topic) q.set("topic", topic);
    q.set("limit", String(limit));
    const r = await fetch(`${KERNEL}/bus/events?${q.toString()}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ─── Economic Intelligence Engine (EIE) ──────────────────────────────────────

const ECONOMIC = process.env["NEXT_PUBLIC_ECONOMIC_URL"] ?? "http://localhost:9050";

// --- Types ---

export type EieAllocationPurpose =
  | "validator_rewards" | "ecosystem_grant" | "liquidity_provision" | "bridge_ops"
  | "security_audit" | "infrastructure" | "marketing" | "r_and_d" | "emergency_reserve" | "governance";

export type EieAllocationStatus = "pending_auto" | "approved" | "executed" | "rejected" | "pending_governance";

export interface EieTreasuryAllocation {
  id: string;
  purpose: EieAllocationPurpose;
  amountWei: string;
  requester: string;
  rationale: string;
  status: EieAllocationStatus;
  createdAt: number;
  resolvedAt?: number;
  approver?: string;
}

export interface EieGrant {
  id: string;
  grantee: string;
  purposeTag: string;
  amountWei: string;
  approvedBy: string;
  milestones: string[];
  completedMilestones: string[];
  disbursed: boolean;
  createdAt: number;
}

export interface EieInvestmentPosition {
  id: string;
  protocol: string;
  layer: string;
  strategy: string;
  principalWei: string;
  currentValueWei: string;
  apyBps: number;
  openedAt: number;
  lastAccruedAt: number;
}

export interface EieTreasuryState {
  totalAllocated: string;
  pendingGovernance: string;
  executedThisEpoch: string;
  openGrants: number;
  totalGrantsWei: string;
  investedWei: string;
  accruedRevenueWei: string;
}

export type EiePoolHealth = "healthy" | "underutilized" | "overutilized" | "critically_low" | "imbalanced";
export type EieStrategyPriority = "emergency" | "high" | "medium" | "low";
export type EieStrategyAction = "deploy" | "withdraw" | "rebalance" | "migrate";

export interface EieLiquidityPool {
  id: string;
  name: string;
  chain: string;
  type: string;
  tvlWei: string;
  utilizationPct: number;
  apyBps: number;
  health: EiePoolHealth;
}

export interface EieLiquidityStrategy {
  id: string;
  poolId: string;
  poolName: string;
  action: EieStrategyAction;
  amountWei: string;
  reason: string;
  priority: EieStrategyPriority;
  status: string;
  createdAt: number;
}

export interface EieArbitrageOpportunity {
  buyPoolId: string;
  sellPoolId: string;
  spreadBps: number;
  estimatedProfitWei: string;
  detectedAt: number;
}

export interface EieLiquidityReport {
  pools: EieLiquidityPool[];
  activeStrategies: EieLiquidityStrategy[];
  arbitrageOpportunities: EieArbitrageOpportunity[];
  totalTvlWei: string;
  avgUtilizationPct: number;
  refreshedAt: number;
}

export interface EieTokenomicsParams {
  baseFeeGwei: number;
  burnRateBps: number;
  validatorRewardBps: number;
  stakingIncentiveBps: number;
  reserveRatioPct: number;
}

export interface EieTokenomicsBounds {
  baseFeeGwei: { min: number; max: number };
  burnRateBps: { min: number; max: number };
  validatorRewardBps: { min: number; max: number };
  stakingIncentiveBps: { min: number; max: number };
  reserveRatioPct: { min: number; max: number };
}

export interface EieBurnProjection {
  day: number;
  date: string;
  estimatedBurnGhost: number;
  cumulativeBurnGhost: number;
}

export interface EieOptimizationRecord {
  id: string;
  timestamp: number;
  previous: EieTokenomicsParams;
  recommended: EieTokenomicsParams;
  applied: boolean;
  requiresGovernance: boolean;
  rationale: string;
}

export type EieMarketSentiment = "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish";

export interface EieMarketTick {
  pair: string;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  change24hPct: number;
  timestamp: number;
  source: string;
}

export interface EieVolatilityMetrics {
  pair: string;
  stdDev: number;
  mean: number;
  coefficient: number;
  windowMs: number;
}

export interface EieArbitrageSignal {
  buyPair: string;
  sellPair: string;
  spreadPct: number;
  netProfitPct: number;
  detectedAt: number;
}

export type EieAlertSeverity = "info" | "warning" | "critical";
export type EieAlertType = "high_volatility" | "price_dump" | "volume_spike" | "liquidity_drain";

export interface EieMarketAlert {
  id: string;
  type: EieAlertType;
  pair: string;
  severity: EieAlertSeverity;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

export interface EieMarketReport {
  latestTicks: EieMarketTick[];
  volatility: EieVolatilityMetrics[];
  arbitrageSignals: EieArbitrageSignal[];
  activeAlerts: EieMarketAlert[];
  sentiment: EieMarketSentiment;
  sentimentScore: number;
  generatedAt: number;
}

export type EieSimVerdict = "pass" | "fail" | "warning";
export type EieScenarioType =
  | "liquidity_injection" | "liquidity_withdrawal" | "burn_rate_change"
  | "validator_reward_change" | "market_stress_test" | "cross_layer_route"
  | "treasury_depletion" | "full_strategy";

export interface EieSimResult {
  id: string;
  scenarioType: EieScenarioType;
  strategyName: string;
  params: Record<string, number | string>;
  verdict: EieSimVerdict;
  blockedReason?: string;
  metrics: Record<string, number>;
  warnings: string[];
  recommendation: string;
  timestamp: number;
}

export interface EieSimStats {
  total: number;
  pass: number;
  fail: number;
  warning: number;
  passRate: number;
  lastRunAt: number | null;
}

// --- Fetch helpers ---

export async function fetchEieStatus(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${ECONOMIC}/eie/status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieTreasury(): Promise<{
  state: EieTreasuryState;
  allocations: EieTreasuryAllocation[];
  grants: EieGrant[];
  investments: EieInvestmentPosition[];
} | null> {
  try {
    const r = await fetch(`${ECONOMIC}/treasury`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieLiquidity(): Promise<EieLiquidityReport | null> {
  try {
    const r = await fetch(`${ECONOMIC}/liquidity`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieTokenomics(): Promise<{
  current: EieTokenomicsParams;
  bounds: EieTokenomicsBounds;
  burnSchedule: EieBurnProjection[];
  history: EieOptimizationRecord[];
} | null> {
  try {
    const r = await fetch(`${ECONOMIC}/tokenomics`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieMarket(): Promise<EieMarketReport | null> {
  try {
    const r = await fetch(`${ECONOMIC}/market`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieMarketAlerts(): Promise<{ alerts: EieMarketAlert[] } | null> {
  try {
    const r = await fetch(`${ECONOMIC}/market/alerts`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEieSimHistory(limit = 20): Promise<{
  history: EieSimResult[];
  stats: EieSimStats;
} | null> {
  try {
    const r = await fetch(`${ECONOMIC}/simulate/history?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchEconomicStatus(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${ECONOMIC}/economic-status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════
// Universal Orchestrator (UO) — port 9990
// ═══════════════════════════════════════════════════════════════════════

const UO = process.env["NEXT_PUBLIC_UO_URL"] ?? "http://localhost:9990";

// --- Types ---

export interface UoServiceHealth {
  ok: boolean;
  latencyMs: number;
  lastChecked: number;
}

export interface UoSystemsOverview {
  systems: Record<string, UoServiceHealth>;
  total: number;
  healthy: number;
}

export interface UoCommand {
  id: string;
  target: string;
  action: string;
  params: Record<string, unknown>;
  priority: string;
  status: "queued" | "dispatching" | "completed" | "failed" | "rejected";
  source: string;
  requester: string;
  issuedAt: number;
  completedAt?: number;
  responseCode?: number;
  error?: string;
}

export interface UoCommandStats {
  total: number;
  completed: number;
  failed: number;
  rejected: number;
  successRate: number;
}

export interface UoDecision {
  id: string;
  type: string;
  subtype?: string;
  payload: Record<string, unknown>;
  priority: string;
  source: string;
  createdAt: number;
}

export interface UoRouteEntry {
  service: string;
  url: string;
  endpoint: string;
  method: string;
  reason: string;
  isPrimary: boolean;
}

export interface UoRouteResult {
  decision: UoDecision;
  primary: UoRouteEntry;
  secondary: UoRouteEntry[];
  routedAt: number;
}

export interface UoWorkflowStep {
  name: string;
  service: string;
  endpoint: string;
  method: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface UoWorkflowRun {
  id: string;
  playbook: string;
  triggeredBy: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  startedAt: number;
  completedAt?: number;
  steps: UoWorkflowStep[];
  error?: string;
}

export interface UoWorkflowStats {
  total: number;
  completed: number;
  failed: number;
  active: number;
  playbooks: Record<string, number>;
}

export interface UoTask {
  id: string;
  type: string;
  label: string;
  targetUrl: string;
  endpoint: string;
  method: string;
  intervalMs?: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastStatus?: "ok" | "error";
  enabled: boolean;
  addedBy: string;
}

export interface UoTaskStats {
  total: number;
  enabled: number;
  recurring: number;
  okRuns: number;
  errorRuns: number;
}

export interface UoEvent {
  id: string;
  category: string;
  severity: "info" | "warning" | "critical" | "emergency";
  message: string;
  source: string;
  payload: Record<string, unknown>;
  acknowledged: boolean;
  workflowHint?: string;
  createdAt: number;
}

export interface UoEventStats {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  critical: number;
  emergency: number;
}

export interface UoStatus {
  health: Record<string, UoServiceHealth>;
  commands: UoCommandStats;
  routes: { total: number; byType: Record<string, number>; successRate: number };
  workflows: UoWorkflowStats;
  tasks: UoTaskStats;
  events: UoEventStats;
  critical: number;
}

// --- Fetch helpers ---

export async function fetchUoStatus(): Promise<UoStatus | null> {
  try {
    const r = await fetch(`${UO}/status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoHealth(): Promise<{ ok: boolean; uptime: number } | null> {
  try {
    const r = await fetch(`${UO}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoSystems(): Promise<UoSystemsOverview | null> {
  try {
    const r = await fetch(`${UO}/systems`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoCommands(limit = 50): Promise<{ history: UoCommand[]; stats: UoCommandStats } | null> {
  try {
    const r = await fetch(`${UO}/commands?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoRoutingTable(): Promise<{ routes: unknown[] } | null> {
  try {
    const r = await fetch(`${UO}/routing-table`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoRoutes(limit = 50): Promise<{ history: UoRouteResult[]; stats: unknown } | null> {
  try {
    const r = await fetch(`${UO}/routes?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoWorkflows(limit = 20): Promise<{
  active: UoWorkflowRun[];
  history: UoWorkflowRun[];
  stats: UoWorkflowStats;
  available: string[];
} | null> {
  try {
    const r = await fetch(`${UO}/workflows?limit=${limit}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoTasks(enabled?: boolean): Promise<{
  tasks: UoTask[];
  stats: UoTaskStats;
  history: unknown[];
} | null> {
  try {
    const url = enabled !== undefined ? `${UO}/tasks?enabled=${enabled}` : `${UO}/tasks`;
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchUoEvents(opts?: {
  category?: string;
  severity?: string;
  limit?: number;
  since?: number;
}): Promise<{ events: UoEvent[]; stats: UoEventStats; critical: UoEvent[] } | null> {
  try {
    const params = new URLSearchParams();
    if (opts?.category) params.set("category", opts.category);
    if (opts?.severity) params.set("severity", opts.severity);
    if (opts?.limit)    params.set("limit",    String(opts.limit));
    if (opts?.since)    params.set("since",    String(opts.since));
    const qs = params.toString();
    const r  = await fetch(`${UO}/events${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Marketing Engine (AIMS) — port 9970
// ─────────────────────────────────────────────────────────────────────────────

const AIMS = process.env["NEXT_PUBLIC_AIMS_URL"] ?? "http://localhost:9970";

export interface AimsScheduleEntry { name: string; running: boolean; nextDate: string }
export interface AimsBudget { totalUSD: number; allocations: { channel: string; pct: number; amount: number }[]; updatedAt: string }
export interface AimsCampaignSummary { activeCampaigns: number; totalImpressions: number; totalClicks: number; totalConversions: number; avgCTR: number; avgCPC: number }
export interface AimsGrowthForecast { horizon: number; currentUsers: number; projectedUsers: number; growthRate: number; confidence: number }

export async function fetchAimsHealth(): Promise<{ status: string; service: string } | null> {
  try { const r = await fetch(`${AIMS}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsCampaigns(): Promise<AimsCampaignSummary | null> {
  try { const r = await fetch(`${AIMS}/analytics/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsBudget(): Promise<AimsBudget | null> {
  try { const r = await fetch(`${AIMS}/treasury/budget`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsSchedule(): Promise<AimsScheduleEntry[] | null> {
  try { const r = await fetch(`${AIMS}/scheduler/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsForecast(horizon = 30): Promise<AimsGrowthForecast | null> {
  try { const r = await fetch(`${AIMS}/analytics/growth?horizon=${horizon}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsTweets(): Promise<{ tweets: { id: string; content: string; postedAt: string; likes: number; retweets: number }[] } | null> {
  try { const r = await fetch(`${AIMS}/social/twitter/recent`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAimsInfluencers(): Promise<{ influencers: { handle: string; platform: string; followers: number; score: number }[] } | null> {
  try { const r = await fetch(`${AIMS}/influencers`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Growth Engine (VGE) — port 9971
// ─────────────────────────────────────────────────────────────────────────────

const VGE = process.env["NEXT_PUBLIC_VGE_URL"] ?? "http://localhost:9971";

export interface VgeSummary {
  memes:       { total: number; avgViral: number };
  campaigns:   { total: number; live: number; totalReach: number };
  influencers: { total: number; accepted: number };
  referrals:   { total: number; rewards: number };
  airdrops:    { total: number; gstDistributed: number };
  token:       { price: number; marketCap: number; holders: number };
}

export async function fetchVgeHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${VGE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchVgeSummary(): Promise<VgeSummary | null> {
  try { const r = await fetch(`${VGE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchVgeCampaigns(): Promise<unknown[] | null> {
  try { const r = await fetch(`${VGE}/campaigns`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchVgeMemes(): Promise<unknown[] | null> {
  try { const r = await fetch(`${VGE}/memes`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchVgeTokenMetrics(): Promise<unknown | null> {
  try { const r = await fetch(`${VGE}/token/metrics`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchVgeReferrals(): Promise<unknown[] | null> {
  try { const r = await fetch(`${VGE}/referrals`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Adoption Engine (AAE) — port 9972
// ─────────────────────────────────────────────────────────────────────────────

const AAE = process.env["NEXT_PUBLIC_AAE_URL"] ?? "http://localhost:9972";

export interface AaeSummary {
  developers:    { total: number; onboarded: number };
  projects:      { total: number; onboarded: number };
  liquidity:     { pools: number; incentivised: number };
  grants:        { total: number; approved: number; totalGST: number };
  partnerships:  { total: number; active: number };
  institutions:  { total: number; contacted: number };
}

export async function fetchAaeHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${AAE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAaeSummary(): Promise<AaeSummary | null> {
  try { const r = await fetch(`${AAE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAaeDevelopers(): Promise<unknown[] | null> {
  try { const r = await fetch(`${AAE}/developers`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAaeProjects(): Promise<unknown[] | null> {
  try { const r = await fetch(`${AAE}/projects`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAaeGrants(): Promise<unknown[] | null> {
  try { const r = await fetch(`${AAE}/grants`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Expansion Engine (GEE) — port 9973
// ─────────────────────────────────────────────────────────────────────────────

const GEE = process.env["NEXT_PUBLIC_GEE_URL"] ?? "http://localhost:9973";

export interface GeeSummary {
  exchanges:    { total: number; listed: number; applications: number };
  media:        { total: number; releases: number };
  partnerships: { total: number; deals: number };
  regions:      { total: number; active: number };
  institutions: { total: number; contacted: number };
  alliances:    { total: number; proposed: number };
}

export async function fetchGeeHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${GEE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGeeSummary(): Promise<GeeSummary | null> {
  try { const r = await fetch(`${GEE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGeeExchanges(): Promise<unknown[] | null> {
  try { const r = await fetch(`${GEE}/exchanges`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGeeRegions(): Promise<unknown[] | null> {
  try { const r = await fetch(`${GEE}/regions`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGeeAlliances(): Promise<unknown[] | null> {
  try { const r = await fetch(`${GEE}/alliances`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGeePartnerships(): Promise<unknown[] | null> {
  try { const r = await fetch(`${GEE}/partnerships`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Economy Engine (AEE) — port 9974
// ─────────────────────────────────────────────────────────────────────────────

const AEE = process.env["NEXT_PUBLIC_AEE_URL"] ?? "http://localhost:9974";

export interface AeeSummary {
  treasury:  { totalUSD: number; departments: number };
  burns:     { totalBurned: number; events: number };
  supply:    { pressureRatio: number; action: string; dailyEmissions: number };
  liquidity: { totalTVL: number; healthyPools: number; avgAPR: number };
  markets:   { live: number; totalTVL: number };
}

export async function fetchAeeHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${AEE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeSummary(): Promise<AeeSummary | null> {
  try { const r = await fetch(`${AEE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeTreasury(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/treasury`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeBurns(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/burns`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeSupply(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/supply`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeMarkets(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/markets`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeLiquidity(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/liquidity`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAeeSimulation(): Promise<unknown | null> {
  try { const r = await fetch(`${AEE}/simulate/default`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ── AIE — Autonomous Infrastructure Engine (9975) ────────────────────────────

const AIE = process.env["NEXT_PUBLIC_AIE_URL"] ?? "http://localhost:9975";

export interface AieSummary {
  system:     { status: string; cpuUsagePercent: number; memUsedPercent: number };
  containers: { total: number; running: number; restarts: number };
  vms:        { total: number };
  balance:    { action: string; cpuPercent: number; memPercent: number };
}
export async function fetchAieHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${AIE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieSummary(): Promise<AieSummary | null> {
  try { const r = await fetch(`${AIE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieSystemHealth(): Promise<unknown | null> {
  try { const r = await fetch(`${AIE}/system/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieContainers(): Promise<unknown | null> {
  try { const r = await fetch(`${AIE}/containers`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieVms(): Promise<unknown | null> {
  try { const r = await fetch(`${AIE}/vms`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieRepairLog(): Promise<unknown | null> {
  try { const r = await fetch(`${AIE}/repair/log`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAieBalanceStatus(): Promise<unknown | null> {
  try { const r = await fetch(`${AIE}/balance/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ── ASE — Autonomous Security Engine (9976) ──────────────────────────────────

const ASE = process.env["NEXT_PUBLIC_ASE_URL"] ?? "http://localhost:9976";

export interface AseSummary {
  threats:    { total: number; critical: number; high: number; unmitigated: number };
  validators: { total: number; healthy: number; alertCount: number } | null;
  treasury:   unknown | null;
  contracts:  { audited: number; blocked: number; avgScore: number };
  network:    { trackedIps: number; blockedIps: number };
  intrusion:  { blocked: number; recentAttempts: number };
}
export async function fetchAseHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${ASE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseSummary(): Promise<AseSummary | null> {
  try { const r = await fetch(`${ASE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseThreats(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/threats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseThreatSummary(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/threats/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseValidators(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/validators`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseTreasuryStatus(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/treasury/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseAudits(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/contracts/audits`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseBlockedIps(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/blocked-ips`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAseIntrusionLog(): Promise<unknown | null> {
  try { const r = await fetch(`${ASE}/intrusion/log`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─── Ghost AI Intelligence Engine (GIE) — port 9977 ──────────────────────────

const GIE = process.env["NEXT_PUBLIC_GIE_URL"] ?? "http://localhost:9977";

export interface GieMemoryStats {
  total:       number;
  byCategory:  Record<string, number>;
  byImportance: Record<string, number>;
  oldestTs:    number | null;
  newestTs:    number | null;
}

export interface GieMemoryEvent {
  id:         string;
  timestamp:  number;
  category:   string;
  importance: string;
  source:     string;
  event:      string;
  outcome?:   string;
  tags:       string[];
}

export interface GiePrediction {
  id:         string;
  timestamp:  number;
  horizon:    "30d" | "60d" | "90d";
  daysOut:    number;
  method:     string;
  basisSize:  number;
  confidence: number;
  predictions: {
    users:      { current: number | null; forecast: number | null; growthRate: number | null };
    tvl:        { current: number | null; forecast: number | null; growthRate: number | null };
    validators: { current: number | null; forecast: number | null; growthRate: number | null };
    threats:    { current: number | null; forecast: number | null; growthRate: number | null };
    ecosystemHealth: number;
  };
}

export interface GieLearningStats {
  cycles:       number;
  modelVersion: number;
  totalSignals: number;
  insights:     number;
  topSignals:   string[];
  riskSignals:  string[];
  lastUpdated:  number;
}

export interface GieDecision {
  id:             string;
  timestamp:      number;
  category:       string;
  priority:       "critical" | "high" | "medium" | "low";
  action:         string;
  rationale:      string;
  targetEngine:   string;
  estimatedImpact: string;
  status:         "pending" | "executed" | "dismissed";
}

export interface GieDecisionStats {
  total:      number;
  pending:    number;
  executed:   number;
  dismissed:  number;
  byPriority: Record<string, number>;
}

export interface GieKnowledgeStats {
  nodes:            number;
  edges:            number;
  nodeTypes:        Record<string, number>;
  topRelationships: { rel: string; count: number }[];
}

export interface GieSummary {
  service:    string;
  timestamp:  number;
  memory:     { total: number; byCategory: Record<string, number> };
  ecosystem:  { onlineCount: number; totalEngines: number; users: number | null; tvl: number | null; validators: number | null; threats: number | null };
  predictions: { horizon: string; confidence: number; method: string; users: number | null; tvl: number | null; validators: number | null; ecosystemHealth: number } | null;
  learning:   { cycles: number; totalSignals: number; modelVersion: number };
  decisions:  { pending: number; total: number; critical: number };
  knowledge:  { nodes: number; edges: number };
}

export async function fetchGieHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${GIE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieSummary(): Promise<GieSummary | null> {
  try { const r = await fetch(`${GIE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieMemoryStats(): Promise<GieMemoryStats | null> {
  try { const r = await fetch(`${GIE}/memory/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieMemoryEvents(limit = 20): Promise<GieMemoryEvent[] | null> {
  try { const r = await fetch(`${GIE}/memory/events?limit=${limit}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGiePredictions(): Promise<GiePrediction[] | null> {
  try { const r = await fetch(`${GIE}/predictions`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieLearningStats(): Promise<GieLearningStats | null> {
  try { const r = await fetch(`${GIE}/learning/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieDecisions(limit = 10): Promise<GieDecision[] | null> {
  try { const r = await fetch(`${GIE}/decisions/pending?limit=${limit}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieDecisionStats(): Promise<GieDecisionStats | null> {
  try { const r = await fetch(`${GIE}/decisions/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieKnowledgeStats(): Promise<GieKnowledgeStats | null> {
  try { const r = await fetch(`${GIE}/knowledge/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGieKnowledgeGraph(): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
  try { const r = await fetch(`${GIE}/knowledge/graph`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─── Ghost Autonomous Governance Engine (AGE-Gov) — port 9978 ────────────────

const AGE = process.env["NEXT_PUBLIC_AGE_URL"] ?? "http://localhost:9978";

export interface AgeProposal {
  id:              string;
  title:           string;
  description:     string;
  category:        string;
  targetDAO:       string;
  status:          string;
  timestamp:       number;
  submittedAt?:    number;
  executedAt?:     number;
  aiConfidence:    number;
  estimatedImpact: string;
  tags:            string[];
  parameters:      Record<string, unknown>;
}

export interface AgePolicySimulation {
  proposalId:          string;
  timestamp:           number;
  durationDays:        number;
  liquidityImpact:     number;
  userGrowthImpact:    number;
  tokenDemandImpact:   number;
  validatorImpact:     number;
  revenueImpact:       number;
  treasuryCost:        number;
  treasuryROI:         number;
  riskLevel:           "low" | "medium" | "high" | "critical";
  riskFactors:         string[];
  recommendation:      "approve" | "reject" | "modify" | "defer";
  rationale:           string;
  confidenceScore:     number;
}

export interface AgeVotingPrediction {
  proposalId:      string;
  totalVoters:     number;
  projectedYes:    number;
  projectedNo:     number;
  projectedAbstain: number;
  projectedYesPct: number;
  weightedYesPct:  number;
  quorumExpected:  boolean;
  likelyOutcome:   "pass" | "fail" | "uncertain";
  confidenceScore: number;
  keyDrivers:      string[];
}

export interface AgeExecutionRecord {
  id:            string;
  proposalId:    string;
  proposalTitle: string;
  timestamp:     number;
  completedAt?:  number;
  status:        "queued" | "executing" | "success" | "failed" | "reverted";
  txHash?:       string;
  gasUsed?:      number;
  auditTrail:    string[];
}

export interface AgeDAO {
  id:                string;
  name:              string;
  description:       string;
  status:            string;
  created:           number;
  quorumThreshold:   number;
  passThreshold:     number;
  votingPeriodDays:  number;
  memberCount:       number;
  validatorCount:    number;
  treasuryUSD:       number;
  treasuryToken:     number;
  totalProposals:    number;
  activeProposals:   number;
  executedProposals: number;
  tags:              string[];
}

export interface AgeSummary {
  proposals:  { total: number; draft: number; voting: number; approved: number; executed: number; rejected: number };
  simulation: { total: number; avgROI: number; avgRisk: string; avgConfidence: number };
  voting:     { registeredVoters: number; totalPredictions: number; likelyPass: number; likelyFail: number };
  execution:  { total: number; success: number; failed: number };
  registry:   { totalDAOs: number; activeDAOs: number; totalMembers: number; totalTreasuryUSD: number; totalTreasuryToken: number };
}

export async function fetchAgeHealth(): Promise<{ status: string } | null> {
  try { const r = await fetch(`${AGE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAgeSummary(): Promise<AgeSummary | null> {
  try { const r = await fetch(`${AGE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAgeProposals(opts?: { status?: string; category?: string; limit?: number }): Promise<AgeProposal[] | null> {
  const params = new URLSearchParams();
  if (opts?.status)   params.set("status",   opts.status);
  if (opts?.category) params.set("category", opts.category);
  if (opts?.limit)    params.set("limit",    String(opts.limit));
  try { const r = await fetch(`${AGE}/proposals?${params}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.proposals ?? null; } catch { return null; }
}
export async function fetchAgeSimulations(): Promise<AgePolicySimulation[] | null> {
  try { const r = await fetch(`${AGE}/simulate`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.simulations ?? null; } catch { return null; }
}
export async function fetchAgeVotingPredictions(): Promise<AgeVotingPrediction[] | null> {
  try { const r = await fetch(`${AGE}/voting`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.predictions ?? null; } catch { return null; }
}
export async function fetchAgeVotingStats(): Promise<Pick<AgeSummary, "voting"> | null> {
  try { const r = await fetch(`${AGE}/voting/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAgeExecutionLog(limit = 10): Promise<AgeExecutionRecord[] | null> {
  try { const r = await fetch(`${AGE}/execute/log?limit=${limit}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.log ?? null; } catch { return null; }
}
export async function fetchAgeDAOs(): Promise<AgeDAO[] | null> {
  try { const r = await fetch(`${AGE}/daos`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.daos ?? null; } catch { return null; }
}
export async function fetchAgeProposalStats(): Promise<AgeSummary["proposals"] | null> {
  try { const r = await fetch(`${AGE}/proposals/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GIE-X — Ghost Interchain Expansion Engine (port 9979)
// ─────────────────────────────────────────────────────────────────────────────

const GIEX = process.env["NEXT_PUBLIC_GIEX_URL"] ?? "http://localhost:9979";

export interface GiexChain {
  id: string; name: string; symbol: string; type: string;
  status: string; overallScore: number; liquidityScore: number;
  userScore: number; compatScore: number; growthScore: number;
  estimatedTVL_USD: number; estimatedUsers: number;
  bridgeDeployed: boolean; poolsDeployed: number;
  wrappedAssets: number; messagesRelayed: number; tags: string[];
}
export interface GiexBridge {
  id: string; source: string; destination: string; mode: string;
  status: string; totalVolume_USD: number; dailyVolume_USD: number;
  txCount: number; successRate: number; bridgeFee_bps: number;
  avgConfirmSecs: number; deployedAt: number;
}
export interface GiexPool {
  id: string; chain: string; protocol: string; pairA: string; pairB: string;
  label: string; status: string; tvl_USD: number; volume24h_USD: number;
  fees24h_USD: number; apy: number; gstRewardsPerDay: number;
}
export interface GiexWrappedAsset {
  id: string; token: string; network: string; standard: string;
  status: string; circulatingSupply: number; holdersCount: number;
  price_USD: number; marketCap_USD: number; pegDeviation_pct: number;
}
export interface GiexMessage {
  id: string; source: string; destination: string; protocol: string;
  type: string; status: string; timestamp: number;
  deliveredAt?: number; gasPaid_USD: number; retries: number;
}
export interface GiexSnapshot {
  timestamp: number;
  discovery: { total: number; active: number; deploying: number; target: number };
  bridges: { total: number; active: number; totalVolume_USD: number; dailyVolume_USD: number };
  liquidity: { totalPools: number; activePools: number; totalTVL_USD: number; avgAPY: number };
  wrappedAssets: { total: number; active: number; totalMarketCap_USD: number; totalHolders: number };
  messaging: { total: number; delivered: number; successRate: number; avgDeliveryMs: number };
  gstExternalLiquidity_USD: number;
  multiChainReach: number;
  interchainHealthScore: number;
}
export interface GiexChainPerformance {
  chain: string; bridgeVolume_USD: number; poolTVL_USD: number;
  wGSTMarketCap_USD: number; messagesRelayed: number;
  overallScore: number; healthStatus: string;
}

export async function fetchGiexHealth(): Promise<{ status: string; uptime: number } | null> {
  try { const r = await fetch(`${GIEX}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGiexSummary(): Promise<{
  discovery: unknown; bridges: unknown; liquidity: unknown;
  assets: unknown; messaging: unknown; snapshot: GiexSnapshot;
} | null> {
  try { const r = await fetch(`${GIEX}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGiexChains(opts?: { status?: string; type?: string; minScore?: number; limit?: number }): Promise<GiexChain[] | null> {
  const p = new URLSearchParams();
  if (opts?.status)   p.set("status",   opts.status);
  if (opts?.type)     p.set("type",     opts.type);
  if (opts?.minScore) p.set("minScore", String(opts.minScore));
  if (opts?.limit)    p.set("limit",    String(opts.limit));
  try { const r = await fetch(`${GIEX}/chains?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.chains ?? null; } catch { return null; }
}
export async function fetchGiexBridges(): Promise<GiexBridge[] | null> {
  try { const r = await fetch(`${GIEX}/bridges`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.bridges ?? null; } catch { return null; }
}
export async function fetchGiexPools(chain?: string): Promise<GiexPool[] | null> {
  const url = chain ? `${GIEX}/liquidity?chain=${encodeURIComponent(chain)}` : `${GIEX}/liquidity`;
  try { const r = await fetch(url, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.pools ?? null; } catch { return null; }
}
export async function fetchGiexAssets(): Promise<GiexWrappedAsset[] | null> {
  try { const r = await fetch(`${GIEX}/assets`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.assets ?? null; } catch { return null; }
}
export async function fetchGiexMessages(opts?: { destination?: string; status?: string; type?: string; limit?: number }): Promise<GiexMessage[] | null> {
  const p = new URLSearchParams();
  if (opts?.destination) p.set("destination", opts.destination);
  if (opts?.status)      p.set("status",      opts.status);
  if (opts?.type)        p.set("type",        opts.type);
  if (opts?.limit)       p.set("limit",       String(opts.limit));
  try { const r = await fetch(`${GIEX}/messages?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.messages ?? null; } catch { return null; }
}
export async function fetchGiexSnapshot(): Promise<GiexSnapshot | null> {
  try { const r = await fetch(`${GIEX}/analytics/snapshot`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGiexChainPerformances(): Promise<GiexChainPerformance[] | null> {
  try { const r = await fetch(`${GIEX}/analytics/chains`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.performances ?? null; } catch { return null; }
}
export async function fetchGiexAnalysis(): Promise<(GiexSnapshot & {
  chainPerformances: GiexChainPerformance[];
  trend: { tvlDelta: number; volumeDelta: number; healthDelta: number } | null;
}) | null> {
  try { const r = await fetch(`${GIEX}/analytics`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ── GAAN — Ghost Autonomous AI Agent Network (port 9981) ─────────────────────
const GAAN = process.env["NEXT_PUBLIC_GAAN_URL"] ?? "http://localhost:9981";

export interface GaanAgent {
  id: string;
  name: string;
  domain: "infrastructure" | "security" | "marketing" | "growth" | "governance" | "economy" | "interchain";
  status: "idle" | "running" | "error" | "paused" | "booting";
  version: string;
  registeredAt: number;
  lastHeartbeat: number;
  lastRun: number;
  tasksCompleted: number;
  tasksActive: number;
  tasksFailed: number;
  currentTask?: string;
  capabilities: string[];
  linkedEngineName: string;
  linkedEnginePort: number;
  decisions: GaanDecision[];
  cycleCount: number;
  autonomyLevel: number;
}

export interface GaanDecision {
  id: string;
  agentId: string;
  action: string;
  reasoning: string;
  impact: "low" | "medium" | "high" | "critical";
  outcome: string;
  timestamp: number;
}

export interface GaanTask {
  id: string;
  type: string;
  title: string;
  description: string;
  domain?: string;
  assignedTo?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "in-progress" | "completed" | "failed" | "cancelled";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  createdBy: string;
}

export interface GaanMessage {
  id: string;
  from: string;
  to: string;
  type: "info" | "alert" | "command" | "response" | "broadcast";
  subject: string;
  content: string;
  timestamp: number;
  acknowledged: boolean;
  replyTo?: string;
}

export interface GaanNetworkSnapshot {
  timestamp: number;
  agents: { total: number; running: number; idle: number; error: number; paused: number };
  tasks:   { total: number; pending: number; inProgress: number; completed: number; failed: number; completionRate: number };
  messages:{ total: number; last24h: number; broadcasts: number; alerts: number };
  networkHealth: number;
  autonomyScore: number;
  cycleCount: number;
}

export async function fetchGaanHealth(): Promise<{ health: number; agents: number; agentsOnline: number; cycleCount: number } | null> {
  try { const r = await fetch(`${GAAN}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGaanSummary(): Promise<{ networkHealth: number; autonomyScore: number; cycleCount: number; agents: Record<string, number>; tasks: Record<string, number>; messages: Record<string, number> } | null> {
  try { const r = await fetch(`${GAAN}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGaanAgents(opts?: { status?: string; domain?: string }): Promise<GaanAgent[] | null> {
  const p = new URLSearchParams();
  if (opts?.status) p.set("status", opts.status);
  if (opts?.domain) p.set("domain", opts.domain);
  try { const r = await fetch(`${GAAN}/agents?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.agents ?? null; } catch { return null; }
}
export async function fetchGaanTasks(opts?: { status?: string; domain?: string; priority?: string; limit?: number }): Promise<GaanTask[] | null> {
  const p = new URLSearchParams();
  if (opts?.status)   p.set("status",   opts.status);
  if (opts?.domain)   p.set("domain",   opts.domain);
  if (opts?.priority) p.set("priority", opts.priority);
  if (opts?.limit)    p.set("limit",    String(opts.limit));
  try { const r = await fetch(`${GAAN}/tasks?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.tasks ?? null; } catch { return null; }
}
export async function fetchGaanMessages(opts?: { limit?: number }): Promise<GaanMessage[] | null> {
  const p = new URLSearchParams();
  if (opts?.limit) p.set("limit", String(opts.limit));
  try { const r = await fetch(`${GAAN}/messages?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.messages ?? null; } catch { return null; }
}
export async function fetchGaanNetwork(): Promise<{ latest: GaanNetworkSnapshot | null } | null> {
  try { const r = await fetch(`${GAAN}/network`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchGaanDecisions(opts?: { agentId?: string; impact?: string; limit?: number }): Promise<GaanDecision[] | null> {
  const p = new URLSearchParams();
  if (opts?.agentId) p.set("agentId", opts.agentId);
  if (opts?.impact)  p.set("impact",  opts.impact);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${GAAN}/decisions?${p}`, { cache: "no-store" }); const d = r.ok ? await r.json() : null; return d?.decisions ?? null; } catch { return null; }
}

// ── ADE — Ghost Autonomous Development Engine (port 9982) ────────────────────
const ADE = process.env["NEXT_PUBLIC_ADE_URL"] ?? "http://localhost:9982";

export interface AdeGeneratedFile {
  id: string; filename: string; service: string; type: string; language: string;
  purpose: string; improvement: string; content: string;
  linesAdded: number; linesRemoved: number; complexity: number;
  timestamp: number; status: string;
}
export interface AdeContract {
  id: string; name: string; type: string; network: string; solidity: string;
  content: string; bytecodeSize: number; functions: number;
  auditStatus: string; deployedAt?: number; address?: string; verified: boolean; builtAt: number;
}
export interface AdeTestRun {
  id: string; target: string; type: string; suite: string;
  totalTests: number; passed: number; failed: number; skipped: number;
  coverage: number; duration: number; status: string; timestamp: number;
  cases: { name: string; status: string; duration: number; error?: string }[];
}
export interface AdeAuditReport {
  id: string; target: string; targetType: string; auditedAt: number;
  score: number; findings: {
    id: string; type: string; severity: string; location: string;
    description: string; recommendation: string;
  }[];
  criticals: number; highs: number; mediums: number; lows: number;
  passed: boolean; recommendation: string; duration_ms: number;
}
export interface AdeDeployment {
  id: string; name: string; type: string; network: string; version: string;
  status: string; txHash?: string; address?: string; gasUsed?: number; blockNumber?: number;
  stages: { name: string; status: string; ms?: number }[];
  deployedAt: number; deployedBy: string; duration_ms?: number;
}
export interface AdePipeline {
  id: string; repo: string; branch: string; commit: string; status: string;
  stages: { name: string; status: string; duration?: number }[];
  triggeredAt: number; completedAt?: number; duration?: number; triggeredBy: string;
}
export interface AdeLoopStatus {
  running: boolean; step: string; cycles: number; lastCycle: number; lastDuration: number;
}

export async function fetchAdeHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ADE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ADE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeLoopStatus(): Promise<AdeLoopStatus | null> {
  try { const r = await fetch(`${ADE}/loop/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeCode(opts?: { service?: string; type?: string; status?: string; limit?: number }): Promise<AdeGeneratedFile[] | null> {
  const p = new URLSearchParams();
  if (opts?.service) p.set("service", opts.service);
  if (opts?.type)    p.set("type",    opts.type);
  if (opts?.status)  p.set("status",  opts.status);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${ADE}/code?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeContracts(opts?: { type?: string; network?: string; limit?: number }): Promise<AdeContract[] | null> {
  const p = new URLSearchParams();
  if (opts?.type)    p.set("type",    opts.type);
  if (opts?.network) p.set("network", opts.network);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${ADE}/contracts?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeTests(opts?: { target?: string; type?: string; limit?: number }): Promise<AdeTestRun[] | null> {
  const p = new URLSearchParams();
  if (opts?.target) p.set("target", opts.target);
  if (opts?.type)   p.set("type",   opts.type);
  if (opts?.limit)  p.set("limit",  String(opts.limit));
  try { const r = await fetch(`${ADE}/tests?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeAudits(opts?: { target?: string; passed?: boolean; limit?: number }): Promise<AdeAuditReport[] | null> {
  const p = new URLSearchParams();
  if (opts?.target !== undefined) p.set("target", opts.target);
  if (opts?.passed !== undefined) p.set("passed", String(opts.passed));
  if (opts?.limit  !== undefined) p.set("limit",  String(opts.limit));
  try { const r = await fetch(`${ADE}/audits?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdeDeployments(opts?: { network?: string; type?: string; limit?: number }): Promise<AdeDeployment[] | null> {
  const p = new URLSearchParams();
  if (opts?.network) p.set("network", opts.network);
  if (opts?.type)    p.set("type",    opts.type);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${ADE}/deployments?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAdePipelines(opts?: { repo?: string; status?: string; limit?: number }): Promise<AdePipeline[] | null> {
  const p = new URLSearchParams();
  if (opts?.repo)   p.set("repo",   opts.repo);
  if (opts?.status) p.set("status", opts.status);
  if (opts?.limit)  p.set("limit",  String(opts.limit));
  try { const r = await fetch(`${ADE}/ci?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ── AI Evolution Engine (ai-evolution, port 9983) ────────────────────────────
const AI_EVO = process.env.NEXT_PUBLIC_AI_EVO_URL ?? "http://localhost:9983";

export interface EvoArchitectureSnapshot { snapshotId: string; networkHealth: string; healthScore: number; bottlenecks: Array<{ id: string; type: string; severity: string; description: string; affectedArea: string }>; improvements: Array<{ id: string; type: string; priority: string; estimatedImpact: number; effort: string }>; analysedAt: number; }
export interface EvoUpgradeProposal { id: string; title: string; upgradeType: string; network: string; status: string; description: string; benefits: string[]; risks: string[]; proposedAt: number; approvedAt?: number; rejectedAt?: number; }
export interface EvoEvolvedFeature { id: string; name: string; category: string; description: string; benefits: string[]; targetChain: string; status: string; complexity: number; roi: number; discoveredAt: number; launchedAt?: number; userAdoption?: number; devTeam: string; }
export interface EvoLaunchedChain { id: string; name: string; chainId: number; type: string; purpose: string; parentChain: string; status: string; validators: number; tps: number; blockTime: number; nativeCurrency: string; rpcEndpoint: string; explorerUrl: string; tvl: number; users: number; launchedAt: number; }
export interface EvoOptimization { id: string; service: string; optimizationType: string; status: string; beforeMetrics: Record<string, number>; afterMetrics: Record<string, number>; improvementPct: number; rollbackRisk: string; triggeredAt: number; completedAt?: number; }
export interface EvoInnovation { id: string; name: string; domain: string; summary: string; benefits: string[]; challenges: string[]; priority: string; status: string; trl: number; effortWeeks: number; impactScore: number; source: string; discoveredAt: number; integratedAt?: number; }
export interface EvoLoopStatus { running: boolean; cycleCount: number; lastRun: number | null; lastError: string | null; phaseLog: string[]; }

export async function fetchEvoHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${AI_EVO}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${AI_EVO}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoSnapshots(limit?: number): Promise<EvoArchitectureSnapshot[] | null> {
  const p = limit ? `?limit=${limit}` : "";
  try { const r = await fetch(`${AI_EVO}/architecture/snapshots${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoUpgrades(opts?: { type?: string; status?: string; network?: string; limit?: number }): Promise<EvoUpgradeProposal[] | null> {
  const p = new URLSearchParams();
  if (opts?.type)    p.set("type",    opts.type);
  if (opts?.status)  p.set("status",  opts.status);
  if (opts?.network) p.set("network", opts.network);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${AI_EVO}/upgrades?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoFeatures(opts?: { category?: string; status?: string; limit?: number }): Promise<EvoEvolvedFeature[] | null> {
  const p = new URLSearchParams();
  if (opts?.category) p.set("category", opts.category);
  if (opts?.status)   p.set("status",   opts.status);
  if (opts?.limit)    p.set("limit",    String(opts.limit));
  try { const r = await fetch(`${AI_EVO}/features?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoChains(opts?: { type?: string; status?: string; limit?: number }): Promise<EvoLaunchedChain[] | null> {
  const p = new URLSearchParams();
  if (opts?.type)   p.set("type",   opts.type);
  if (opts?.status) p.set("status", opts.status);
  if (opts?.limit)  p.set("limit",  String(opts.limit));
  try { const r = await fetch(`${AI_EVO}/chains?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoOptimizations(opts?: { service?: string; type?: string; limit?: number }): Promise<EvoOptimization[] | null> {
  const p = new URLSearchParams();
  if (opts?.service) p.set("service", opts.service);
  if (opts?.type)    p.set("type",    opts.type);
  if (opts?.limit)   p.set("limit",   String(opts.limit));
  try { const r = await fetch(`${AI_EVO}/optimizations?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchEvoInnovations(opts?: { domain?: string; status?: string; priority?: string; limit?: number }): Promise<EvoInnovation[] | null> {
  const p = new URLSearchParams();
  if (opts?.domain)   p.set("domain",   opts.domain);
  if (opts?.status)   p.set("status",   opts.status);
  if (opts?.priority) p.set("priority", opts.priority);
  if (opts?.limit)    p.set("limit",    String(opts.limit));
  try { const r = await fetch(`${AI_EVO}/innovations?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}


// ── Planetary Network Engine (PNE) ───────────────────────────────────────────
const PNE = process.env.NEXT_PUBLIC_PNE_URL ?? "http://localhost:9984";

export interface PneGlobalNode { id: string; name: string; type: string; region: { id: string; name: string; continent: string; lat: number; lon: number; cloud: string }; network: string; status: string; ip: string; peerCount: number; blockHeight: number; latency_ms: number; uptime: number; cpu: number; memory: number; deployedAt: number; version: string; }
export interface PneRegionConfig { regionId: string; region: { id: string; name: string; continent: string }; validators: number; rpcGateways: number; archiveNodes: number; edgeNodes: number; totalNodes: number; onlineNodes: number; healthScore: number; avgLatency_ms: number; coverage: string[]; lastUpdated: number; }
export interface PneTrafficRoute { id: string; userRegion: { id: string; name: string }; targetNode: { id: string; name: string; ip: string; rpcPort: number }; protocol: string; status: string; latency_ms: number; requestsRouted: number; errorRate: number; createdAt: number; lastRouted: number; }
export interface PneLatencyEntry { fromRegion: string; toRegion: string; latency_ms: number; hops: number; protocol: string; measuredAt: number; }
export interface PnePlanetaryHealth { snapshotId: string; timestamp: number; totalNodes: number; onlineNodes: number; activeRegions: number; totalRegions: number; avgLatency_ms: number; globalTps: number; networkHealth: string; healthScore: number; incidents: Array<{ id: string; title: string; region: string; severity: string; status: string; detectedAt: number }>; byRegion: Array<{ regionId: string; regionName: string; nodes: number; online: number; latency_ms: number; health: string }>; }
export interface PneLoopStatus { running: boolean; cycleCount: number; lastRun: number | null; lastError: string | null; phaseLog: string[]; }

export async function fetchPneHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${PNE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${PNE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneNodes(opts?: { regionId?: string; type?: string; network?: string; status?: string; limit?: number }): Promise<PneGlobalNode[] | null> {
  const p = new URLSearchParams();
  if (opts?.regionId) p.set("regionId", opts.regionId);
  if (opts?.type)     p.set("type",     opts.type);
  if (opts?.network)  p.set("network",  opts.network);
  if (opts?.status)   p.set("status",   opts.status);
  if (opts?.limit)    p.set("limit",    String(opts.limit));
  try { const r = await fetch(`${PNE}/nodes?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneRegions(): Promise<PneRegionConfig[] | null> {
  try { const r = await fetch(`${PNE}/regions`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneRoutes(opts?: { userRegionId?: string; protocol?: string; status?: string; limit?: number }): Promise<PneTrafficRoute[] | null> {
  const p = new URLSearchParams();
  if (opts?.userRegionId) p.set("userRegionId", opts.userRegionId);
  if (opts?.protocol)     p.set("protocol",     opts.protocol);
  if (opts?.status)       p.set("status",       opts.status);
  if (opts?.limit)        p.set("limit",        String(opts.limit));
  try { const r = await fetch(`${PNE}/routes?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneLatencyMatrix(fromRegion?: string, toRegion?: string): Promise<PneLatencyEntry[] | null> {
  const p = new URLSearchParams();
  if (fromRegion) p.set("fromRegion", fromRegion);
  if (toRegion)   p.set("toRegion",   toRegion);
  try { const r = await fetch(`${PNE}/latency/matrix?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchPneMonitoring(): Promise<PnePlanetaryHealth | null> {
  try { const r = await fetch(`${PNE}/monitoring/latest`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ghost Interplanetary Network Engine (INE) — port 9985
// ─────────────────────────────────────────────────────────────────────────────
const INE = process.env.NEXT_PUBLIC_INE_URL ?? "http://localhost:9985";

export interface IneSatelliteRelay {
  id: string; name: string; constellation: string; orbit: string;
  role: string; network: string; status: string;
  altitudeKm: number; latency_ms: number; throughputMbps: number;
  uptime: number; relayedTx: number; blocksRelayed: number; peersConnected: number;
  launchedAt: number; lastContact: number;
}
export interface IneOrbitalValidator {
  id: string; name: string; orbitType: string; network: string;
  role: string; status: string; altitudeKm: number; latency_ms: number;
  cpuCores: number; memoryGB: number; blockHeight: number;
  missedSlots: number; totalSlots: number; uptime: number;
  geopoliticalZone: string; censorshipRisk: string;
  deployedAt: number; lastHeartbeat: number;
}
export interface IneCommLink {
  id: string; name: string; fromNode: string; toNode: string;
  fromCategory: string; toCategory: string; protocol: string; status: string;
  distanceKm: number; latency_ms: number; bandwidth_kbps: number;
  signalStrength: number; packetLoss: number; bytesExchanged: number;
  establishedAt: number; lastSync: number;
}
export interface IneRoute {
  id: string; fromRegion: string; toRegion: string;
  mode: string; protocol: string; status: string; latency_ms: number;
  bytesRouted: number; requestsRouted: number; errorRate: number;
  createdAt: number; lastRouted: number;
}
export interface IneSpaceSnapshot {
  snapshotId: string; timestamp: number;
  totalSatellites: number; activeSatellites: number;
  totalValidators: number; activeValidators: number;
  totalCommLinks: number; activeCommLinks: number;
  avgSatLatency_ms: number; avgValLatency_ms: number;
  networkHealth: string; healthScore: number;
  relayedTxTotal: number; blocksRelayedTotal: number;
}
export interface IneLoopStatus {
  running: boolean; cycleCount: number; lastRun: number | null;
  lastError: string | null; phaseLog: string[];
}

export async function fetchIneHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneLoopStatus(): Promise<IneLoopStatus | null> {
  try { const r = await fetch(`${INE}/loop/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneSatellites(opts?: { network?: string; status?: string; constellation?: string }): Promise<IneSatelliteRelay[] | null> {
  const p = new URLSearchParams();
  if (opts?.network)       p.set("network",       opts.network);
  if (opts?.status)        p.set("status",        opts.status);
  if (opts?.constellation) p.set("constellation", opts.constellation);
  try { const r = await fetch(`${INE}/satellites?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneSatelliteStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/satellites/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneValidators(opts?: { network?: string; status?: string; orbit?: string }): Promise<IneOrbitalValidator[] | null> {
  const p = new URLSearchParams();
  if (opts?.network) p.set("network", opts.network);
  if (opts?.status)  p.set("status",  opts.status);
  if (opts?.orbit)   p.set("orbit",   opts.orbit);
  try { const r = await fetch(`${INE}/validators?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneValidatorStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/validators/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneRoutes(opts?: { mode?: string; status?: string }): Promise<IneRoute[] | null> {
  const p = new URLSearchParams();
  if (opts?.mode)   p.set("mode",   opts.mode);
  if (opts?.status) p.set("status", opts.status);
  try { const r = await fetch(`${INE}/routing/routes?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneRoutingStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/routing/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneCommLinks(): Promise<IneCommLink[] | null> {
  try { const r = await fetch(`${INE}/comms/links`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneCommsStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${INE}/comms/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneMonitoring(): Promise<IneSpaceSnapshot | null> {
  try { const r = await fetch(`${INE}/monitoring/latest`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchIneHealthHistory(limit?: number): Promise<IneSpaceSnapshot[] | null> {
  const p = limit ? `?limit=${limit}` : "";
  try { const r = await fetch(`${INE}/monitoring/history${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GhostStack Hypervisor Control Layer (HCL) — port 9986
// ─────────────────────────────────────────────────────────────────────────────
const HCL = process.env.NEXT_PUBLIC_HCL_URL ?? "http://localhost:9986";

export type HclVmState       = "creating" | "running" | "stopped" | "destroying" | "snapshotting" | "errored";
export type HclVmRole        = "ghostchain-validator" | "ghostl2-node" | "ghostl3-node" | "ghostbrain" | "monitoring" | "ai-engine" | "general";
export type HclContainerState= "running" | "stopped" | "restarting" | "exited" | "errored" | "pulling";
export type HclNodeState     = "deploying" | "syncing" | "running" | "offline" | "degraded" | "decommissioned";
export type HclChain         = "ghostchain" | "ghostl2" | "ghostl3";
export type HclNodeRole      = "validator" | "rpc-node" | "archive-node" | "bootnode";
export type HclIncidentStatus= "detected" | "recovering" | "resolved" | "failed";
export type HclRecoveryAction= "restart-container" | "restart-vm" | "provision-replacement-node" | "scale-up-nodes" | "rebalance-load" | "alert-only";

export interface HclVM {
  id: string; name: string; role: HclVmRole; state: HclVmState;
  cpuCores: number; ramGB: number; diskGB: number; ip: string;
  hypervisor: string; os: string; uptime: number; cpuPct: number; memPct: number;
  snapshots: Array<{ id: string; name: string; sizeMB: number; createdAt: number }>;
  createdAt: number; lastActivity: number;
}

export interface HclContainer {
  id: string; name: string; image: string; stack: string; state: HclContainerState;
  port: number | null; restarts: number; cpuPct: number; memMB: number;
  exitCode?: number; uptime: number; startedAt: number; lastEvent: number;
}

export interface HclNode {
  id: string; chain: HclChain; role: HclNodeRole; state: HclNodeState;
  vmId: string; ip: string; rpcPort: number; wsPort: number; p2pPort: number;
  blockHeight: number; peersConnected: number; isSynced: boolean;
  cpuPct: number; memMB: number; txPerSec: number; uptime: number;
  deployedAt: number; lastBlock: number;
}

export interface HclInfraSnapshot {
  snapshotId: string; timestamp: number;
  host: {
    cpuPct: number; cpuCores: number;
    memUsedGB: number; memTotalGB: number; memPct: number;
    diskUsedGB: number; diskTotalGB: number; diskPct: number;
    loadAvg: [number, number, number];
    networkRxMbps: number; networkTxMbps: number;
  };
  vms:        { total: number; running: number; stopped: number; errored: number };
  containers: { total: number; running: number; stopped: number; restarting: number; errored: number };
  nodes:      { total: number; running: number; offline: number; syncing: number; synced: number };
  healthScore: number; health: string; alerts: string[];
}

export interface HclIncident {
  id: string; timestamp: number; service: string; serviceType: string;
  severity: string; status: HclIncidentStatus; description: string;
  action: HclRecoveryAction; actionLog: string[];
  resolvedAt?: number; resolvedBy?: string;
}

export interface HclLoopStatus {
  running: boolean; cycleCount: number; lastRun: number | null;
  lastError: string | null; phaseLog: string[];
}

export async function fetchHclHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclLoopStatus(): Promise<HclLoopStatus | null> {
  try { const r = await fetch(`${HCL}/loop/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclVMs(opts?: { role?: HclVmRole; state?: HclVmState }): Promise<HclVM[] | null> {
  const p = new URLSearchParams();
  if (opts?.role)  p.set("role",  opts.role);
  if (opts?.state) p.set("state", opts.state);
  try { const r = await fetch(`${HCL}/vms?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclVmStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/vms/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclContainers(opts?: { stack?: string; state?: HclContainerState }): Promise<HclContainer[] | null> {
  const p = new URLSearchParams();
  if (opts?.stack) p.set("stack", opts.stack);
  if (opts?.state) p.set("state", opts.state);
  try { const r = await fetch(`${HCL}/containers?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclContainerStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/containers/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclNodes(opts?: { chain?: HclChain; role?: HclNodeRole; state?: HclNodeState }): Promise<HclNode[] | null> {
  const p = new URLSearchParams();
  if (opts?.chain) p.set("chain", opts.chain);
  if (opts?.role)  p.set("role",  opts.role);
  if (opts?.state) p.set("state", opts.state);
  try { const r = await fetch(`${HCL}/nodes?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclNodeStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/nodes/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclMonitoring(): Promise<HclInfraSnapshot | null> {
  try { const r = await fetch(`${HCL}/monitoring/latest`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclMonitoringHistory(limit?: number): Promise<HclInfraSnapshot[] | null> {
  const p = limit ? `?limit=${limit}` : "";
  try { const r = await fetch(`${HCL}/monitoring/history${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclIncidents(status?: HclIncidentStatus): Promise<HclIncident[] | null> {
  const p = status ? `?status=${status}` : "";
  try { const r = await fetch(`${HCL}/recovery/incidents${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchHclRecoveryStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${HCL}/recovery/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}

// ── Autonomous Revenue Engine (ARE) ─────────────────────────────────────────
const ARE = process.env.NEXT_PUBLIC_ARE_URL ?? "http://localhost:9987";

export type ArePoolState      = "active" | "paused" | "rebalancing" | "draining";
export type ArePoolChain      = "ghostl2" | "ghostchain";
export type AreValidatorStatus= "active" | "jailed" | "unbonding" | "inactive";
export type AreStrategyType   = "market-making" | "arbitrage" | "liquidity-balancing" | "trend-following";
export type AreStrategyStatus = "running" | "paused" | "stopped" | "backtesting";
export type AreJobType        = "ai-training" | "inference" | "zkp-proof" | "data-indexing" | "smart-contract-audit" | "model-serving";
export type AreJobState       = "queued" | "processing" | "complete" | "failed" | "cancelled";
export type AreSaaSStatus     = "active" | "trial" | "suspended" | "cancelled";

export interface AreLiquidityPool {
  id: string; pair: string; chain: ArePoolChain; state: ArePoolState;
  tvlUSD: number; apr: number; volume24hUSD: number; fees24hUSD: number;
  token0: string; token1: string; lastRebalance: number; rebalanceCount: number;
}
export interface AreValidator {
  id: string; address: string; chain: string;
  stake: number; pendingRewards: number; totalEarned: number;
  blocksProduced: number; missedSlots: number; performancePct: number;
  commission: number; status: AreValidatorStatus; lastBlock: number;
}
export interface AreTradingStrategy {
  id: string; name: string; type: AreStrategyType; chain: string;
  status: AreStrategyStatus; pnlUSD: number; pnlPct: number;
  totalTrades: number; winningTrades: number; winRate: number;
  capitalAllocatedUSD: number; openPositions: number; lastExecuted: number;
}
export interface AreComputeJob {
  id: string; type: AreJobType; client: string; costGST: number;
  computeUnits: number; gpuCount: number; state: AreJobState;
  progress: number; startedAt: number | null; completedAt: number | null; submittedAt: number;
}
export interface AreSaaSClient {
  id: string; name: string; service: string; chain: string;
  monthlyFeeUSD: number; annualFeeUSD: number; status: AreSaaSStatus;
  nodes: number; uptimePct: number; apiCallsToday: number;
}
export interface AreTreasury {
  totalUSD: number; totalGST: number; gstPriceUSD: number; lastUpdated: number;
  reserves: { operationalUSD: number; developmentUSD: number; ecosystemUSD: number; emergencyUSD: number };
}
export interface AreRevenueSnapshot {
  timestamp: number; defiFeesUSD: number; validatorRewardsUSD: number;
  tradingPnlUSD: number; computeRevenueUSD: number; saasRevenueUSD: number; totalUSD: number;
}
export interface AreDistribution {
  id: string; timestamp: number; totalUSD: number;
  treasuryUSD: number; validatorsUSD: number; ecosystemUSD: number;
  txHash: string; status: "pending" | "executed" | "failed";
}

export async function fetchAreHealth(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/health`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreSummary(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreLoopStatus(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/loop/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreDefiPools(opts?: { chain?: ArePoolChain; state?: ArePoolState }): Promise<AreLiquidityPool[] | null> {
  const p = new URLSearchParams();
  if (opts?.chain) p.set("chain", opts.chain);
  if (opts?.state) p.set("state", opts.state);
  try { const r = await fetch(`${ARE}/defi/pools?${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreDefiStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/defi/pools/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreValidators(status?: AreValidatorStatus): Promise<AreValidator[] | null> {
  const p = status ? `?status=${status}` : "";
  try { const r = await fetch(`${ARE}/validators${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreValidatorStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/validators/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreTradingStrategies(status?: AreStrategyStatus): Promise<AreTradingStrategy[] | null> {
  const p = status ? `?status=${status}` : "";
  try { const r = await fetch(`${ARE}/trading/strategies${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreTradingStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/trading/strategies/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreComputeJobs(state?: AreJobState): Promise<AreComputeJob[] | null> {
  const p = state ? `?state=${state}` : "";
  try { const r = await fetch(`${ARE}/marketplace/jobs${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreMarketplaceStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/marketplace/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreSaaSClients(status?: AreSaaSStatus): Promise<AreSaaSClient[] | null> {
  const p = status ? `?status=${status}` : "";
  try { const r = await fetch(`${ARE}/saas/clients${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreSaaSStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/saas/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreTreasury(): Promise<AreTreasury | null> {
  try { const r = await fetch(`${ARE}/treasury/balance`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreTreasuryStats(): Promise<Record<string, unknown> | null> {
  try { const r = await fetch(`${ARE}/treasury/stats`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreRevenueHistory(limit?: number): Promise<AreRevenueSnapshot[] | null> {
  const p = limit ? `?limit=${limit}` : "";
  try { const r = await fetch(`${ARE}/treasury/history${p}`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export async function fetchAreDistributions(): Promise<AreDistribution[] | null> {
  try { const r = await fetch(`${ARE}/treasury/distributions`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}


