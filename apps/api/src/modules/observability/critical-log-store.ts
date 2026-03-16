import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { NormalizedLogEvent } from '@ghostchain/types/observability';

export interface CriticalLogRecord {
  id: string;
  recordedAt: string;
  prevHash: string;
  hash: string;
  hmac?: string;
  event: NormalizedLogEvent;
}

export class CriticalLogStore {
  private readonly filePath: string;
  private readonly hmacSecret?: string;
  private readonly seen = new Set<string>();
  private lastHash = 'GENESIS';

  constructor(filePath: string, hmacSecret?: string) {
    this.filePath = filePath;
    this.hmacSecret = hmacSecret;
    this.bootstrap();
  }

  private bootstrap() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', { encoding: 'utf8' });
      return;
    }
    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
    lines.forEach((line) => {
      try {
        const record = JSON.parse(line) as CriticalLogRecord;
        this.seen.add(record.id);
        this.lastHash = record.hash || this.lastHash;
      } catch {
        // ignore malformed lines; the hash chain still marks tampering
      }
    });
  }

  private buildRecord(event: NormalizedLogEvent): CriticalLogRecord {
    const recordedAt = new Date().toISOString();
    const payload = JSON.stringify({ event, recordedAt });
    const hash = crypto.createHash('sha256').update(`${this.lastHash}:${payload}`).digest('hex');
    const record: CriticalLogRecord = {
      id: event.id,
      recordedAt,
      prevHash: this.lastHash,
      hash,
      event
    };
    if (this.hmacSecret) {
      record.hmac = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
    }
    return record;
  }

  append(event: NormalizedLogEvent): boolean {
    if (this.seen.has(event.id)) return false;
    const record = this.buildRecord(event);
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
    this.seen.add(event.id);
    this.lastHash = record.hash;
    return true;
  }

  appendMany(events: NormalizedLogEvent[]) {
    events.forEach((event) => this.append(event));
  }

  list(limit = 200): CriticalLogRecord[] {
    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
    const records: CriticalLogRecord[] = [];
    for (let i = lines.length - 1; i >= 0 && records.length < limit; i -= 1) {
      try {
        records.push(JSON.parse(lines[i]) as CriticalLogRecord);
      } catch {
        continue;
      }
    }
    return records;
  }
}
