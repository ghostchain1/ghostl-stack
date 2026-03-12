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

