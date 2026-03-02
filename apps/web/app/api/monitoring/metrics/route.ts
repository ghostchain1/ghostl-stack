import { NextResponse } from 'next/server';

export type MetricItem = {
  name: string;
  value: string;
  target: string;
  health: 'ok' | 'warn' | 'crit';
  unit?: string;
};

export type MetricGroup = {
  group: string;
  layer: string;
  items: MetricItem[];
};

const METRICS: MetricGroup[] = [
  {
    group: 'GhostChain L1', layer: 'L1',
    items: [
      { name: 'block_time_s',        value: '1.9',  target: '2',    health: 'ok',   unit: 's'   },
      { name: 'active_validators',   value: '21',   target: '21',   health: 'ok'                },
      { name: 'mempool_size_tx',     value: '48',   target: '500',  health: 'ok'                },
      { name: 'rpc_latency_p99_ms',  value: '22',   target: '100',  health: 'ok',   unit: 'ms'  },
    ],
  },
  {
    group: 'GhostL2', layer: 'L2',
    items: [
      { name: 'proposer_lag_ms',     value: '65',   target: '120',  health: 'ok',   unit: 'ms'  },
      { name: 'l1_l2_deposit_lag_s', value: '192',  target: '300',  health: 'ok',   unit: 's'   },
      { name: 'pool_utilisation_pct',value: '84',   target: '90',   health: 'warn', unit: '%'   },
      { name: 'bridge_relay_tps',    value: '12',   target: '10',   health: 'ok'                },
    ],
  },
  {
    group: 'GhostL3', layer: 'L3',
    items: [
      { name: 'sequencer_tps',       value: '240',  target: '100',  health: 'ok'                },
      { name: 'batcher_queue_tx',    value: '18',   target: '500',  health: 'ok'                },
      { name: 'prover_latency_p95_s',value: '1.8',  target: '1',    health: 'warn', unit: 's'   },
      { name: 'prover_queue_depth',  value: '44',   target: '100',  health: 'ok'                },
    ],
  },
  {
    group: 'AI Systems', layer: 'AI',
    items: [
      { name: 'sentinel_active_alerts',  value: '2',    target: '0',   health: 'warn'            },
      { name: 'treasury_ai_drift_pct',   value: '0.1',  target: '1',   health: 'ok',   unit: '%' },
      { name: 'ghostload_latency_p99_ms',value: '12',   target: '50',  health: 'ok',   unit: 'ms'},
      { name: 'inference_errors_per_hr', value: '0',    target: '0',   health: 'ok'              },
    ],
  },
];

export async function GET() {
  const now = new Date().toISOString();
  return NextResponse.json({
    ts: now,
    metrics: METRICS,
    summary: {
      ok:   METRICS.flatMap(g => g.items).filter(i => i.health === 'ok').length,
      warn: METRICS.flatMap(g => g.items).filter(i => i.health === 'warn').length,
      crit: METRICS.flatMap(g => g.items).filter(i => i.health === 'crit').length,
    },
  });
}
