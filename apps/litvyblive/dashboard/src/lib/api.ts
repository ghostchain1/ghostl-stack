import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("ghost_admin_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface DashboardStats {
  totalUsers:     number;
  liveStreams:    number;
  gstVolume24h:  number;
  activeAgencies: number;
}

export interface Stream {
  id: string; host_id: string; host_name: string; title: string;
  viewer_count: number; is_pk_active: number; is_avatar_mode: number;
  category: string; started_at: string;
}

export interface User {
  id: string; username: string; email: string; level: number;
  followers: number; gst_balance: number; talent_score: number;
  agency_id: string | null; is_host: number; created_at: string;
}

export interface Agency {
  id: string; name: string; hosts_count: number;
  monthly_revenue: number; ranking: number; commission_rate: number;
  logo_url?: string;
}

export interface RankEntry {
  rank: number; userId: string; username: string;
  level: number; score: number;
}

// ── GhostBrain Governor types ─────────────────────────────────────────────
export type AgentName = 'economy' | 'security' | 'discovery' | 'event' | 'infrastructure' | 'treasury';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface GovernorDecision {
  agent:     AgentName;
  action:    string;
  reason:    string;
  severity:  AlertSeverity;
  timestamp: number;
}

export interface AgentStatus {
  name:      AgentName;
  healthy:   boolean;
  lastRunMs: number;
  lastError: string | null;
  decisions: number;
}

export interface GovernorState {
  running:    boolean;
  cycleCount: number;
  uptime:     number;
  agents:     AgentStatus[];
  decisions:  GovernorDecision[];
  metrics: {
    totalUsers: number; liveStreams: number; gstVolume24h: number;
    activeAgencies: number; activeEvents: number; pendingPayouts: number;
    settlementQueueDepth: number; flaggedAccounts: number; rewardMultiplier: number;
  };
}

// ──────────────────────────────────────────────
// API calls
// ──────────────────────────────────────────────
export const fetchStats = (): Promise<DashboardStats> =>
  api.get("/admin/stats").then((r) => r.data);

export const fetchLiveStreams = (): Promise<Stream[]> =>
  api.get("/streams/live").then((r) => r.data.streams ?? r.data);

export const fetchUsers = (page = 1, limit = 50): Promise<{ users: User[]; total: number }> =>
  api.get(`/users?page=${page}&limit=${limit}`).then((r) => r.data);

export const fetchAgency = (id: string): Promise<Agency> =>
  api.get(`/agency/${id}`).then((r) => r.data);

export const fetchAgencyList = (): Promise<Agency[]> =>
  api.get("/agency/list").then((r) => r.data);

export const fetchRankings = (type: string): Promise<RankEntry[]> =>
  api.get(`/rankings/${type}`).then((r) => r.data.entries ?? r.data);

export const fetchRevenueHistory = (): Promise<{ date: string; gst: number }[]> =>
  api.get("/admin/revenue").then((r) => r.data);

export const endStream = (id: string) =>
  api.post(`/streams/${id}/end`).then((r) => r.data);

export const banUser = (id: string) =>
  api.post(`/users/${id}/ban`).then((r) => r.data);

// ── GhostBrain Governor ───────────────────────────────────────────────────
export const fetchGovernorState = (): Promise<GovernorState> =>
  api.get("/admin/ghostbrain").then((r) => r.data);

export const fetchGovernorDecisions = (): Promise<GovernorDecision[]> =>
  api.get("/admin/ghostbrain/decisions").then((r) => r.data);
