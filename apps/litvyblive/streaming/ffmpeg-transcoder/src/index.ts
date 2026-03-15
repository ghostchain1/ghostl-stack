/**
 * LitVybzLive — FFmpeg Transcoder
 * Stream recording, HLS segmentation, and highlight clipping
 *
 * Port: 3004
 *
 * Workflow:
 *   1. stream:started event → auto-start recording if RECORD_ALL=true
 *   2. POST /recordings/start → manual start; calls mediasoup PlainTransport
 *   3. FFmpeg receives RTP and encodes → /recordings/{streamId}/stream.mp4
 *   4. HLS: /hls/{streamId}/index.m3u8 (6-second segments)
 *   5. stream:ended  → stop recording, finalize MP4
 *   6. POST /clips → extract highlight clip from timestamp range
 */
import express, { Request, Response } from 'express';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT           ?? '3004', 10);
const REDIS_URL      = process.env.REDIS_URL               ?? 'redis://redis:6379';
const DATA_DIR       = process.env.DATA_DIR                ?? '/data';
const RECORDINGS_DIR = process.env.RECORDINGS_DIR          ?? '/recordings';
const HLS_DIR        = process.env.HLS_DIR                 ?? '/hls';
const MEDIASOUP_HTTP = process.env.MEDIASOUP_HTTP_URL      ?? 'http://mediasoup-server:3000';
const RECORD_ALL     = process.env.RECORD_ALL              === 'true';
const FFMPEG_BIN     = process.env.FFMPEG_BIN              ?? 'ffmpeg';

// ── Setup directories ─────────────────────────────────────────────────────────
[DATA_DIR, RECORDINGS_DIR, HLS_DIR].forEach(d => mkdirSync(d, { recursive: true }));

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'transcoder.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS recordings (
    id           TEXT PRIMARY KEY,
    stream_id    TEXT NOT NULL,
    host_id      TEXT,
    status       TEXT NOT NULL DEFAULT 'recording'
                   CHECK(status IN ('recording','completed','failed')),
    mp4_path     TEXT,
    hls_path     TEXT,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER,
    duration_ms  INTEGER,
    file_size_b  INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_rec_stream ON recordings(stream_id);

  CREATE TABLE IF NOT EXISTS clips (
    id           TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL,
    stream_id    TEXT NOT NULL,
    title        TEXT,
    start_ms     INTEGER NOT NULL,
    end_ms       INTEGER NOT NULL,
    mp4_path     TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );
`);

// ── Active process tracking ───────────────────────────────────────────────────
interface ActiveRecording {
  recordingId: string;
  streamId:    string;
  ffmpegProc:  ChildProcess;
  hlsProc:     ChildProcess | null;
  startedAt:   number;
  plainTransportId?: string;
}

const activeRecordings = new Map<string, ActiveRecording>(); // streamId → recording

// ── FFmpeg process builder ────────────────────────────────────────────────────
/**
 * Start FFmpeg to receive RTP audio + video and write MP4 + HLS
 *
 * In a full integration, mediasoup creates a PlainTransport, sends RTP to a
 * local UDP port, and FFmpeg reads from that port.
 *
 * For testing without a live mediasoup, set DUMMY_STREAM=true to use a test card.
 */
function startFfmpegRecording(
  streamId: string,
  opts: { audioPort: number; videoPort: number; outDir: string; hlsDir: string },
): { mp4: ChildProcess; hls: ChildProcess } {
  mkdirSync(opts.outDir, { recursive: true });
  mkdirSync(opts.hlsDir, { recursive: true });

  const mp4Out = path.join(opts.outDir, 'stream.mp4');
  const hlsOut = path.join(opts.hlsDir, 'index.m3u8');

  const isDummy = process.env.DUMMY_STREAM === 'true';

  // ── MP4 recording process ───────────────────────────────────────────────
  const mp4Args = isDummy
    ? [
        '-re', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-c:v', 'libx264', '-preset', 'veryfast', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+frag_keyframe+empty_moov+faststart',
        '-y', mp4Out,
      ]
    : [
        // Receive RTP video (VP8) from mediasoup plain transport
        '-protocol_whitelist', 'file,rtp,udp',
        '-f', 'rtp', '-i', `rtp://127.0.0.1:${opts.videoPort}`,
        '-f', 'rtp', '-i', `rtp://127.0.0.1:${opts.audioPort}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+frag_keyframe+empty_moov+faststart',
        '-y', mp4Out,
      ];

  const mp4Proc = spawn(FFMPEG_BIN, mp4Args, { stdio: ['ignore', 'pipe', 'pipe'] });
  mp4Proc.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString();
    if (msg.includes('error') || msg.includes('Error')) console.error(`[ffmpeg:mp4] ${msg.trim()}`);
  });

  // ── HLS segmentation process ────────────────────────────────────────────
  const hlsArgs = isDummy
    ? [
        '-re', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-c:v', 'libx264', '-preset', 'veryfast', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_list_size', '0',
        '-hls_segment_filename', path.join(opts.hlsDir, 'seg%03d.ts'),
        '-y', hlsOut,
      ]
    : [
        '-protocol_whitelist', 'file,rtp,udp',
        '-f', 'rtp', '-i', `rtp://127.0.0.1:${opts.videoPort + 100}`,
        '-f', 'rtp', '-i', `rtp://127.0.0.1:${opts.audioPort + 100}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_list_size', '0',
        '-hls_segment_filename', path.join(opts.hlsDir, 'seg%03d.ts'),
        '-y', hlsOut,
      ];

  const hlsProc = spawn(FFMPEG_BIN, hlsArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  hlsProc.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString();
    if (msg.includes('error') || msg.includes('Error')) console.error(`[ffmpeg:hls] ${msg.trim()}`);
  });

  return { mp4: mp4Proc, hls: hlsProc };
}

/** Extract a highlight clip from an already-recorded MP4 */
function extractClip(
  sourceMp4: string,
  outPath:   string,
  startSec:  number,
  durationSec: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      '-i', sourceMp4,
      '-ss', String(startSec),
      '-t',  String(durationSec),
      '-c',  'copy',
      '-y',  outPath,
    ], { stdio: 'pipe' });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

// ── App ───────────────────────────────────────────────────────────────────────
const app   = express();
const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => console.warn('[redis] unavailable'));
const sub   = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => console.warn('[redis-sub] unavailable'));

app.use(express.json());
app.use('/recordings', express.static(RECORDINGS_DIR));
app.use('/hls',        express.static(HLS_DIR));

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeRecordings: activeRecordings.size, recordAll: RECORD_ALL });
});

app.get('/recordings', (_req, res) => {
  const rows = db.prepare('SELECT * FROM recordings ORDER BY started_at DESC LIMIT 100').all();
  res.json(rows);
});

app.get('/recordings/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recordings WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

app.get('/recordings/stream/:streamId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM recordings WHERE stream_id=? ORDER BY started_at DESC',
  ).all(req.params.streamId);
  res.json(rows);
});

/** POST /recordings/start — manually start recording a stream */
app.post('/recordings/start', async (req: Request, res: Response) => {
  const { streamId, hostId } = req.body as { streamId: string; hostId?: string };
  if (!streamId) return res.status(400).json({ error: 'streamId required' });
  if (activeRecordings.has(streamId)) return res.status(409).json({ error: 'Already recording' });

  const recordingId = uuidv4();
  const outDir      = path.join(RECORDINGS_DIR, streamId);
  const hlsDir      = path.join(HLS_DIR, streamId);

  // Allocate RTP ports (static for demo; production uses port manager)
  const basePort  = 5000 + (activeRecordings.size * 4);
  const audioPort = basePort;
  const videoPort = basePort + 2;

  const { mp4, hls } = startFfmpegRecording(streamId, { audioPort, videoPort, outDir, hlsDir });

  const rec: ActiveRecording = {
    recordingId, streamId, ffmpegProc: mp4, hlsProc: hls,
    startedAt: Date.now(),
  };
  activeRecordings.set(streamId, rec);

  db.prepare(
    `INSERT INTO recordings (id,stream_id,host_id,mp4_path,hls_path,started_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(
    recordingId, streamId, hostId ?? null,
    path.join(outDir, 'stream.mp4'),
    path.join(hlsDir, 'index.m3u8'),
    Date.now(),
  );

  await redis.publish('recording:started', JSON.stringify({ recordingId, streamId }));

  res.status(201).json({
    recordingId, streamId,
    audioRtpPort: audioPort, videoRtpPort: videoPort,
    hlsUrl:  `/hls/${streamId}/index.m3u8`,
    mp4Url:  `/recordings/${streamId}/stream.mp4`,
  });
});

/** POST /recordings/stop — stop recording a stream */
app.post('/recordings/stop', async (req: Request, res: Response) => {
  const { streamId } = req.body as { streamId: string };
  const rec = activeRecordings.get(streamId);
  if (!rec) return res.status(404).json({ error: 'Not recording' });

  rec.ffmpegProc.kill('SIGINT');
  rec.hlsProc?.kill('SIGINT');
  activeRecordings.delete(streamId);

  const durationMs = Date.now() - rec.startedAt;
  db.prepare(
    `UPDATE recordings SET status='completed',ended_at=?,duration_ms=? WHERE id=?`,
  ).run(Date.now(), durationMs, rec.recordingId);

  await redis.publish('recording:completed', JSON.stringify({
    recordingId: rec.recordingId, streamId, durationMs,
  }));

  res.json({ stopped: true, recordingId: rec.recordingId, durationMs });
});

/** POST /clips — extract a highlight clip */
app.post('/clips', async (req: Request, res: Response) => {
  const { streamId, startMs, endMs, title } =
    req.body as { streamId: string; startMs: number; endMs: number; title?: string };

  if (!streamId || startMs == null || endMs == null) {
    return res.status(400).json({ error: 'streamId, startMs, endMs required' });
  }

  const sourceMp4 = path.join(RECORDINGS_DIR, streamId, 'stream.mp4');
  if (!existsSync(sourceMp4)) return res.status(404).json({ error: 'Recording not found' });

  const clipId  = uuidv4();
  const clipDir = path.join(RECORDINGS_DIR, streamId, 'clips');
  mkdirSync(clipDir, { recursive: true });
  const outPath = path.join(clipDir, `${clipId}.mp4`);

  const startSec    = startMs / 1000;
  const durationSec = (endMs - startMs) / 1000;

  try {
    await extractClip(sourceMp4, outPath, startSec, durationSec);
  } catch (e: unknown) {
    return res.status(500).json({ error: (e as Error).message });
  }

  // Find parent recording
  const recording = db.prepare(
    `SELECT id FROM recordings WHERE stream_id=? AND status='completed' LIMIT 1`,
  ).get(streamId) as { id: string } | undefined;

  db.prepare(
    `INSERT INTO clips (id,recording_id,stream_id,title,start_ms,end_ms,mp4_path,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    clipId, recording?.id ?? '', streamId, title ?? null,
    startMs, endMs, outPath, Date.now(),
  );

  await redis.publish('clip:created', JSON.stringify({ clipId, streamId, title, durationSec }));

  res.status(201).json({
    clipId, streamId, durationSec,
    url: `/recordings/${streamId}/clips/${clipId}.mp4`,
  });
});

app.get('/clips/:streamId', (req, res) => {
  const clips = db.prepare('SELECT * FROM clips WHERE stream_id=? ORDER BY created_at DESC').all(req.params.streamId);
  res.json(clips);
});

// ── Redis subscriptions ───────────────────────────────────────────────────────
sub.subscribe('stream:started', 'stream:ended').catch(() => {});

sub.on('message', async (channel: string, msg: string) => {
  const payload = JSON.parse(msg) as Record<string, unknown>;

  if (channel === 'stream:started' && RECORD_ALL) {
    const { streamId, hostId } = payload as { streamId: string; hostId: string };
    // Auto-start via internal HTTP call
    const basePort  = 5000 + (activeRecordings.size * 4);
    const outDir    = path.join(RECORDINGS_DIR, streamId);
    const hlsDir    = path.join(HLS_DIR, streamId);
    const { mp4, hls } = startFfmpegRecording(streamId,
      { audioPort: basePort, videoPort: basePort + 2, outDir, hlsDir });

    const recordingId = uuidv4();
    activeRecordings.set(streamId, {
      recordingId, streamId, ffmpegProc: mp4, hlsProc: hls, startedAt: Date.now(),
    });
    db.prepare(
      `INSERT INTO recordings (id,stream_id,host_id,mp4_path,hls_path,started_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(recordingId, streamId, hostId ?? null,
      path.join(outDir, 'stream.mp4'), path.join(hlsDir, 'index.m3u8'), Date.now());

    await redis.publish('recording:started', JSON.stringify({ recordingId, streamId }));
    console.log(`[auto-record] ${streamId} → recording ${recordingId}`);
  }

  if (channel === 'stream:ended') {
    const { streamId } = payload as { streamId: string };
    const rec = activeRecordings.get(streamId);
    if (rec) {
      rec.ffmpegProc.kill('SIGINT');
      rec.hlsProc?.kill('SIGINT');
      activeRecordings.delete(streamId);
      const durationMs = Date.now() - rec.startedAt;
      db.prepare(
        `UPDATE recordings SET status='completed',ended_at=?,duration_ms=? WHERE id=?`,
      ).run(Date.now(), durationMs, rec.recordingId);
      await redis.publish('recording:completed', JSON.stringify({
        recordingId: rec.recordingId, streamId, durationMs,
      }));
      console.log(`[auto-record] ${streamId} ended → ${durationMs}ms recorded`);
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`ffmpeg-transcoder :${PORT}  recordAll=${RECORD_ALL}  ffmpeg=${FFMPEG_BIN}`));
