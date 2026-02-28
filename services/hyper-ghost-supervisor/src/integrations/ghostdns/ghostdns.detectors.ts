import type { SqliteDb } from '../../db/sqlite.js';
import { GhostDnsClient } from './ghostdns.client.js';

const criticalHosts = ['l1.ghostchain.cloud', 'l2.ghostchain.cloud', 'l3.ghostchain.cloud'];

export async function runGhostDnsDetectors(db: SqliteDb, client: GhostDnsClient, _env: string) {
  const incidents: Array<{ severity: string; detector: string; details: object }> = [];

  try {
    const health = (await client.health()) as any;
    if (!health.ok) {
      incidents.push({ severity: 'P1', detector: 'ghostdns.health', details: health });
    }
  } catch (error) {
    incidents.push({ severity: 'P0', detector: 'ghostdns.health', details: { error: String(error) } });
  }

  try {
    const zone = (await client.zone()) as any;
    const zoneText = String(zone.zone || '');
    for (const host of criticalHosts) {
      if (!zoneText.includes(host.split('.')[0])) {
        incidents.push({ severity: 'P1', detector: 'ghostdns.critical-host-missing', details: { host } });
      }
    }
  } catch (error) {
    incidents.push({ severity: 'P1', detector: 'ghostdns.zone-read', details: { error: String(error) } });
  }

  for (const incident of incidents) {
    db.prepare(
      `INSERT INTO ghostdns_incidents (ts, severity, detector, status, details_json) VALUES (?, ?, ?, ?, ?)`
    ).run(Math.floor(Date.now() / 1000), incident.severity, incident.detector, 'open', JSON.stringify(incident.details));
  }

  return incidents;
}
