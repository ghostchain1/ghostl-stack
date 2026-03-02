'use client';

import { LayerBadge } from '@/components/brand/LayerBadge';

type ProposalStatus = 'ACTIVE' | 'PENDING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';

interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumRequired: number;
  timelockEndsAt?: string;
  proposedBy?: string;
  type: 'STANDARD' | 'CONSTITUTIONAL' | 'EMERGENCY';
}

interface GovernanceVotePanelProps {
  proposals?: GovernanceProposal[];
  totalVotingSupply?: number;
  className?: string;
}

const STATUS_CONFIG: Record<ProposalStatus, { color: string; bg: string; border: string; label: string }> = {
  ACTIVE:   { color: '#00F0B5', bg: 'rgba(0,240,181,0.1)',   border: 'rgba(0,240,181,0.3)',   label: 'ACTIVE'    },
  PENDING:  { color: '#C9A227', bg: 'rgba(201,162,39,0.1)',  border: 'rgba(201,162,39,0.3)',  label: 'PENDING'   },
  EXECUTED: { color: '#00C2FF', bg: 'rgba(0,194,255,0.1)',   border: 'rgba(0,194,255,0.3)',   label: 'EXECUTED'  },
  REJECTED: { color: '#FF3B3B', bg: 'rgba(255,59,59,0.1)',   border: 'rgba(255,59,59,0.3)',   label: 'REJECTED'  },
  EXPIRED:  { color: '#8A9BB5', bg: 'rgba(138,155,181,0.1)', border: 'rgba(138,155,181,0.3)', label: 'EXPIRED'   },
};

const TYPE_CONFIG = {
  STANDARD:      { color: '#7A5CFF', label: 'Standard'      },
  CONSTITUTIONAL:{ color: '#C9A227', label: 'Constitutional' },
  EMERGENCY:     { color: '#FF3B3B', label: 'Emergency'      },
};

const DEFAULT_PROPOSALS: GovernanceProposal[] = [
  {
    id: 'GSP-0047',
    title: 'Adjust Epoch Budget Cap — Q2 2026',
    description: 'Increase epoch budget cap from 50,000 GST to 75,000 GST to accommodate federation expansion costs.',
    status: 'ACTIVE',
    votesFor: 6_240_000,
    votesAgainst: 1_120_000,
    votesAbstain: 340_000,
    quorumRequired: 10_000_000,
    timelockEndsAt: '2026-04-15T00:00:00Z',
    proposedBy: 'GhostStack Treasury Authority',
    type: 'STANDARD',
  },
  {
    id: 'GSP-0046',
    title: 'Validator Minimum Stake Adjustment',
    description: 'Reduce minimum validator stake from 100,000 GST to 75,000 GST to expand federation participation.',
    status: 'PENDING',
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    quorumRequired: 10_000_000,
    timelockEndsAt: '2026-04-22T00:00:00Z',
    proposedBy: 'Ghost Federation Council',
    type: 'STANDARD',
  },
  {
    id: 'GSP-0045',
    title: 'Reserve Floor Ratio — Constitutional Amendment',
    description: 'Amend constitutional reserve floor ratio from 20% to 22% for enhanced stability.',
    status: 'EXECUTED',
    votesFor: 14_800_000,
    votesAgainst: 2_100_000,
    votesAbstain: 600_000,
    quorumRequired: 10_000_000,
    proposedBy: 'GhostStack Foundation',
    type: 'CONSTITUTIONAL',
  },
];

function formatVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * GovernanceVotePanel — Constitutional governance proposal listing and voting interface.
 * Displays active proposals, vote counts, quorum progress, and timelock status.
 */
export function GovernanceVotePanel({
  proposals = DEFAULT_PROPOSALS,
  totalVotingSupply = 100_000_000,
  className = '',
}: GovernanceVotePanelProps) {
  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(201,162,39,0.2)' }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #C9A227, transparent)',
      }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <LayerBadge layer="L1" showDot />
          <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#C9A227' }}>
            Governance
          </span>
        </div>
        <div style={{
          padding: '3px 10px',
          background: 'rgba(201,162,39,0.08)',
          border: '1px solid rgba(201,162,39,0.2)',
          borderRadius: 999,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '0.62rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: '#C9A227',
          textTransform: 'uppercase' as const,
        }}>
          Constitutional
        </div>
      </div>

      {/* Proposals */}
      <div className="flex flex-col gap-3">
        {proposals.map((proposal) => {
          const statusCfg = STATUS_CONFIG[proposal.status];
          const typeCfg = TYPE_CONFIG[proposal.type];
          const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
          const quorumPct = Math.min(100, (totalVotes / proposal.quorumRequired) * 100);
          const forPct = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;
          const againstPct = totalVotes > 0 ? (proposal.votesAgainst / totalVotes) * 100 : 0;

          return (
            <div
              key={proposal.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${statusCfg.border}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              {/* Proposal header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.65rem',
                    color: '#8A9BB5',
                    flexShrink: 0,
                  }}>
                    {proposal.id}
                  </span>
                  <span style={{
                    padding: '1px 6px',
                    background: statusCfg.bg,
                    border: `1px solid ${statusCfg.border}`,
                    borderRadius: 999,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.58rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    color: statusCfg.color,
                    textTransform: 'uppercase' as const,
                  }}>
                    {statusCfg.label}
                  </span>
                  <span style={{
                    padding: '1px 6px',
                    background: `${typeCfg.color}15`,
                    border: `1px solid ${typeCfg.color}30`,
                    borderRadius: 999,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.58rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    color: typeCfg.color,
                    textTransform: 'uppercase' as const,
                  }}>
                    {typeCfg.label}
                  </span>
                </div>
              </div>

              {/* Title */}
              <p style={{
                fontFamily: 'Sora, system-ui, sans-serif',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#E8EDF5',
                marginBottom: 4,
              }}>
                {proposal.title}
              </p>

              {/* Description */}
              <p style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '0.72rem',
                color: '#8A9BB5',
                lineHeight: 1.5,
                marginBottom: 10,
              }}>
                {proposal.description}
              </p>

              {/* Vote bars (only if votes exist) */}
              {totalVotes > 0 && (
                <div className="mb-3">
                  {/* For/Against bar */}
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', display: 'flex', marginBottom: 4 }}>
                    <div style={{ width: `${forPct}%`, background: '#00F0B5', transition: 'width 0.5s ease' }} />
                    <div style={{ width: `${againstPct}%`, background: '#FF3B3B', transition: 'width 0.5s ease' }} />
                  </div>
                  <div className="flex justify-between">
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#00F0B5' }}>
                      ✓ {formatVotes(proposal.votesFor)} ({forPct.toFixed(0)}%)
                    </span>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#FF3B3B' }}>
                      ✗ {formatVotes(proposal.votesAgainst)} ({againstPct.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Quorum progress */}
              <div className="mb-3">
                <div className="flex justify-between mb-1">
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase' }}>
                    Quorum
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: quorumPct >= 100 ? '#00F0B5' : '#C9A227' }}>
                    {formatVotes(totalVotes)} / {formatVotes(proposal.quorumRequired)} ({quorumPct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${quorumPct}%`,
                    background: quorumPct >= 100 ? '#00F0B5' : '#C9A227',
                    borderRadius: 2,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                {proposal.proposedBy && (
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
                    By: {proposal.proposedBy}
                  </span>
                )}
                {proposal.timelockEndsAt && proposal.status === 'ACTIVE' && (
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.62rem',
                    color: '#C9A227',
                    padding: '2px 6px',
                    background: 'rgba(201,162,39,0.08)',
                    borderRadius: 4,
                  }}>
                    ⏱ Timelock: {new Date(proposal.timelockEndsAt).toLocaleDateString()}
                  </span>
                )}
                {proposal.status === 'ACTIVE' && (
                  <div className="flex gap-2 ml-auto">
                    <button style={{
                      padding: '4px 12px',
                      background: 'rgba(0,240,181,0.1)',
                      border: '1px solid rgba(0,240,181,0.3)',
                      borderRadius: 6,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: '#00F0B5',
                      cursor: 'pointer',
                      letterSpacing: '0.06em',
                    }}>
                      APPROVE
                    </button>
                    <button style={{
                      padding: '4px 12px',
                      background: 'rgba(255,59,59,0.1)',
                      border: '1px solid rgba(255,59,59,0.3)',
                      borderRadius: 6,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: '#FF3B3B',
                      cursor: 'pointer',
                      letterSpacing: '0.06em',
                    }}>
                      REJECT
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between" style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
          Voting supply: {formatVotes(totalVotingSupply)} GST
        </span>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
          Quorum: 10% · Supermajority: 66%
        </span>
      </div>
    </div>
  );
}
