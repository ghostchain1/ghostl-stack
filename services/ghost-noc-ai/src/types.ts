export interface NocAlert {
  id:        string;
  severity:  'critical' | 'warning' | 'info';
  source:    string;
  monitor:   string;
  message:   string;
  timestamp: string;
  resolved:  boolean;
  metadata?: Record<string, unknown>;
}

export interface NocProposal {
  id:             string;
  source:         'ghost-noc-ai';
  type:           'infrastructure_proposal';
  entityType:     string;
  target:         string;
  action:         string;
  rationale:      string;
  timestamp:      string;
  requiresQuorum: true;
  alertIds:       string[];
}

export interface MonitorResult {
  alerts:    NocAlert[];
  proposals: NocProposal[];
}

export interface NocStatus {
  healthy:          boolean;
  uptime:           number;
  monitors:         string[];
  recentAlerts:     NocAlert[];
  recentProposals:  NocProposal[];
  alertCount:       number;
  proposalCount:    number;
  lastRun:          string | null;
  dryRun:           boolean;
}
