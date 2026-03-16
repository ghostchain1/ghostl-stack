/**
 * LitVybzLive — MediaSoup SFU Server
 * Core Selective Forwarding Unit for WebRTC streaming
 *
 * Port: 3000 (HTTP + Socket.IO signaling)
 * Ports: 40000-49999/udp (WebRTC RTP/RTCP)
 *
 * Architecture:
 *   - One Worker per CPU core (up to 4)
 *   - One Router per stream room
 *   - WebRtcTransport per peer (send or recv)
 *   - PlainTransport for FFmpeg recording
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import * as mediasoup from 'mediasoup';
import Redis from 'ioredis';
import os from 'os';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.PORT         ?? '3000', 10);
const REDIS_URL    = process.env.REDIS_URL             ?? 'redis://redis:6379';
const ANNOUNCED_IP = process.env.ANNOUNCED_IP          ?? '127.0.0.1';
const RTC_MIN      = parseInt(process.env.RTC_MIN_PORT ?? '40000', 10);
const RTC_MAX      = parseInt(process.env.RTC_MAX_PORT ?? '49999', 10);
const NODE_ID      = process.env.NODE_ID               ?? `ms-${os.hostname()}`;
const REGION       = process.env.REGION                ?? 'default';

// ── RTP Media Codecs ──────────────────────────────────────────────────────────
const CODECS: mediasoup.types.RtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus',   clockRate: 48000, channels: 2,
    preferredPayloadType: 100 },
  { kind: 'video', mimeType: 'video/VP8',    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: { 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/VP9',    clockRate: 90000,
    preferredPayloadType: 101,
    parameters: { 'profile-id': 2, 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/h264',   clockRate: 90000,
    preferredPayloadType: 102,
    parameters: { 'packetization-mode': 1, 'profile-level-id': '4d0032',
                  'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 } },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Peer {
  socketId: string;
  userId:   string;
  role:     'producer' | 'consumer';
  transports: Set<string>;
  producers:  Set<string>;
  consumers:  Set<string>;
}

interface Room {
  streamId:   string;
  router:     mediasoup.types.Router;
  peers:      Map<string, Peer>;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  plainTransports: Map<string, mediasoup.types.PlainTransport>;
  producers:  Map<string, mediasoup.types.Producer>;
  consumers:  Map<string, mediasoup.types.Consumer>;
  createdAt:  number;
}

// ── State ─────────────────────────────────────────────────────────────────────
const workers: mediasoup.types.Worker[] = [];
let nextWorker = 0;
const rooms = new Map<string, Room>();

// ── Worker pool ───────────────────────────────────────────────────────────────
async function spawnWorker(): Promise<mediasoup.types.Worker> {
  const w = await mediasoup.createWorker({
    logLevel:   'warn',
    logTags:    ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    rtcMinPort: RTC_MIN,
    rtcMaxPort: RTC_MAX,
  });
  w.on('died', (err) => {
    console.error(`Worker ${w.pid} died:`, err?.message ?? err);
    const idx = workers.indexOf(w);
    if (idx >= 0) workers.splice(idx, 1);
    spawnWorker().then(nw => workers.push(nw)).catch(console.error);
  });
  return w;
}

async function initWorkers(): Promise<void> {
  const n = Math.min(os.cpus().length, 4);
  for (let i = 0; i < n; i++) {
    workers.push(await spawnWorker());
    console.log(`Worker ${i + 1}/${n} ready (pid: ${workers[i]!.pid})`);
  }
}

function pickWorker(): mediasoup.types.Worker {
  const w = workers[nextWorker % workers.length];
  nextWorker++;
  return w!;
}

// ── Room helpers ──────────────────────────────────────────────────────────────
async function getOrCreate(streamId: string): Promise<Room> {
  const existing = rooms.get(streamId);
  if (existing) return existing;

  const router = await pickWorker().createRouter({ mediaCodecs: CODECS });
  const room: Room = {
    streamId,
    router,
    peers:           new Map(),
    transports:      new Map(),
    plainTransports: new Map(),
    producers:       new Map(),
    consumers:       new Map(),
    createdAt:       Date.now(),
  };
  rooms.set(streamId, room);
  console.log(`[room] created: ${streamId}`);
  return room;
}

function closeRoom(streamId: string): void {
  const room = rooms.get(streamId);
  if (!room) return;
  room.router.close();
  rooms.delete(streamId);
  console.log(`[room] closed: ${streamId}`);
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const http = createServer(app);
const io   = new SocketIO(http, { cors: { origin: '*' } });
const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => console.warn('[redis] unavailable — events disabled'));

app.use(express.json());

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', nodeId: NODE_ID, region: REGION,
             workers: workers.length, rooms: rooms.size, uptime: process.uptime() });
});

app.get('/stats', (_req, res) => {
  let peers = 0, producers = 0, consumers = 0;
  rooms.forEach(r => { peers += r.peers.size; producers += r.producers.size; consumers += r.consumers.size; });
  res.json({ nodeId: NODE_ID, region: REGION, rooms: rooms.size, peers, producers, consumers,
             workers: workers.map(w => ({ pid: w.pid, closed: w.closed })) });
});

app.get('/rooms', (_req, res) => {
  const list = Array.from(rooms.values()).map(r => ({
    streamId:  r.streamId,
    peers:     r.peers.size,
    producers: r.producers.size,
    consumers: r.consumers.size,
    ageMs:     Date.now() - r.createdAt,
  }));
  res.json(list);
});

app.get('/rooms/:streamId/rtp-capabilities', async (req, res) => {
  const room = await getOrCreate(req.params.streamId!);
  res.json(room.router.rtpCapabilities);
});

app.get('/rooms/:streamId/producers', (req, res) => {
  const room = rooms.get(req.params.streamId!);
  if (!room) return res.status(404).json({ error: 'not found' });
  res.json(Array.from(room.producers.values()).map(p => ({ id: p.id, kind: p.kind, paused: p.paused })));
});

app.delete('/rooms/:streamId', (req, res) => {
  if (!rooms.has(req.params.streamId!)) return res.status(404).json({ error: 'not found' });
  closeRoom(req.params.streamId!);
  res.json({ closed: true });
});

// PlainTransport endpoint — used by ffmpeg-transcoder for recording
app.post('/rooms/:streamId/plain-transport', async (req, res) => {
  try {
    const room = await getOrCreate(req.params.streamId!);
    const pt = await room.router.createPlainTransport({
      listenIp: { ip: '0.0.0.0', announcedIp: ANNOUNCED_IP },
      rtcpMux: false,
      comedia: false,
    });
    room.plainTransports.set(pt.id, pt);

    // Connect to ffmpeg RTP listener
    const { ffmpegIp, audioRtpPort, videoRtpPort } =
      req.body as { ffmpegIp: string; audioRtpPort: number; videoRtpPort: number };

    if (ffmpegIp && audioRtpPort) {
      await pt.connect({ ip: ffmpegIp, port: audioRtpPort, rtcpPort: audioRtpPort + 1 });
    }

    res.json({ id: pt.id, ip: pt.tuple?.localIp, port: pt.tuple?.localPort });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Plain-consume: let ffmpeg consume an existing producer via plain transport
app.post('/rooms/:streamId/plain-consume', async (req, res) => {
  try {
    const room = rooms.get(req.params.streamId!);
    if (!room) return res.status(404).json({ error: 'room not found' });

    const { plainTransportId, producerId } =
      req.body as { plainTransportId: string; producerId: string };

    const pt = room.plainTransports.get(plainTransportId);
    if (!pt) return res.status(404).json({ error: 'plain transport not found' });
    const producer = room.producers.get(producerId);
    if (!producer) return res.status(404).json({ error: 'producer not found' });

    const consumer = await pt.consume({ producerId, rtpCapabilities: room.router.rtpCapabilities });
    res.json({ consumerId: consumer.id, kind: consumer.kind, rtpParameters: consumer.rtpParameters });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Socket.IO Signaling ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const userId = (socket.handshake.query.userId as string) ?? 'anon';
  let roomId: string | null = null;

  // joinRoom → get router RTP capabilities
  socket.on('joinRoom',
    async (
      { streamId, role = 'consumer' }: { streamId: string; role?: 'producer' | 'consumer' },
      cb: (v: { rtpCapabilities: mediasoup.types.RtpCapabilities } | { error: string }) => void,
    ) => {
      try {
        const room = await getOrCreate(streamId);
        roomId = streamId;
        socket.join(streamId);
        room.peers.set(socket.id, {
          socketId: socket.id, userId, role,
          transports: new Set(), producers: new Set(), consumers: new Set(),
        });
        cb({ rtpCapabilities: room.router.rtpCapabilities });
        await redis.publish('mediasoup:peer:joined', JSON.stringify({ streamId, userId, role, nodeId: NODE_ID }));
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // createTransport → allocate WebRTC transport
  socket.on('createTransport',
    async (
      { streamId }: { streamId: string },
      cb: (v: {
        id: string; iceParameters: mediasoup.types.IceParameters;
        iceCandidates: mediasoup.types.IceCandidate[]; dtlsParameters: mediasoup.types.DtlsParameters;
      } | { error: string }) => void,
    ) => {
      try {
        const room = rooms.get(streamId);
        if (!room) return cb({ error: 'room not found' });

        const t = await room.router.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
          enableUdp: true, enableTcp: true, preferUdp: true,
          initialAvailableOutgoingBitrate: 1_000_000,
        });

        t.on('dtlsstatechange', (s) => { if (s === 'failed' || s === 'closed') t.close(); });
        room.transports.set(t.id, t);
        room.peers.get(socket.id)?.transports.add(t.id);

        cb({ id: t.id, iceParameters: t.iceParameters, iceCandidates: t.iceCandidates,
             dtlsParameters: t.dtlsParameters });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // connectTransport → DTLS handshake
  socket.on('connectTransport',
    async (
      { streamId, transportId, dtlsParameters }:
        { streamId: string; transportId: string; dtlsParameters: mediasoup.types.DtlsParameters },
      cb: (v: { connected: boolean } | { error: string }) => void,
    ) => {
      try {
        const t = rooms.get(streamId)?.transports.get(transportId);
        if (!t) return cb({ error: 'transport not found' });
        await t.connect({ dtlsParameters });
        cb({ connected: true });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // produce → creator starts sending media
  socket.on('produce',
    async (
      { streamId, transportId, kind, rtpParameters, appData = {} }:
        { streamId: string; transportId: string; kind: mediasoup.types.MediaKind;
          rtpParameters: mediasoup.types.RtpParameters; appData: Record<string, unknown> },
      cb: (v: { producerId: string } | { error: string }) => void,
    ) => {
      try {
        const room = rooms.get(streamId);
        const t    = room?.transports.get(transportId);
        if (!room || !t) return cb({ error: 'transport not found' });

        const producer = await t.produce({ kind, rtpParameters, appData });
        room.producers.set(producer.id, producer);
        room.peers.get(socket.id)?.producers.add(producer.id);

        producer.on('transportclose', () => room.producers.delete(producer.id));

        // Notify all other peers in the room
        socket.to(streamId).emit('newProducer', { producerId: producer.id, kind, userId });

        await redis.publish('mediasoup:producer:new',
          JSON.stringify({ streamId, producerId: producer.id, kind, userId, nodeId: NODE_ID }));
        cb({ producerId: producer.id });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // consume → viewer starts receiving media
  socket.on('consume',
    async (
      { streamId, transportId, producerId, rtpCapabilities }:
        { streamId: string; transportId: string; producerId: string;
          rtpCapabilities: mediasoup.types.RtpCapabilities },
      cb: (v: { consumerId: string; producerId: string; kind: mediasoup.types.MediaKind;
                rtpParameters: mediasoup.types.RtpParameters } | { error: string }) => void,
    ) => {
      try {
        const room = rooms.get(streamId);
        const t    = room?.transports.get(transportId);
        if (!room || !t) return cb({ error: 'transport not found' });

        if (!room.router.canConsume({ producerId, rtpCapabilities }))
          return cb({ error: 'incompatible RTP capabilities' });

        const c = await t.consume({ producerId, rtpCapabilities, paused: true });
        room.consumers.set(c.id, c);
        room.peers.get(socket.id)?.consumers.add(c.id);

        c.on('transportclose', () => room.consumers.delete(c.id));
        c.on('producerclose', () => {
          room.consumers.delete(c.id);
          socket.emit('consumerClosed', { consumerId: c.id });
        });

        cb({ consumerId: c.id, producerId, kind: c.kind, rtpParameters: c.rtpParameters });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // resumeConsumer → must be called after consume to begin media flow
  socket.on('resumeConsumer',
    async (
      { streamId, consumerId }: { streamId: string; consumerId: string },
      cb: (v: { resumed: boolean } | { error: string }) => void,
    ) => {
      try {
        const c = rooms.get(streamId)?.consumers.get(consumerId);
        if (!c) return cb({ error: 'consumer not found' });
        await c.resume();
        cb({ resumed: true });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // getProducers → list active producers so viewer can subscribe
  socket.on('getProducers',
    ({ streamId }: { streamId: string },
     cb: (v: Array<{ producerId: string; kind: mediasoup.types.MediaKind }>) => void) => {
      const room = rooms.get(streamId);
      if (!room) return cb([]);
      cb(Array.from(room.producers.values()).map(p => ({ producerId: p.id, kind: p.kind })));
    },
  );

  // closeProducer → creator stops a track
  socket.on('closeProducer',
    ({ streamId, producerId }: { streamId: string; producerId: string },
     cb?: (v: { closed: boolean }) => void) => {
      const room = rooms.get(streamId);
      const p    = room?.producers.get(producerId);
      if (p) { p.close(); room!.producers.delete(producerId); }
      cb?.({ closed: true });
    },
  );

  // disconnect → cleanup peer resources
  socket.on('disconnect', async () => {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(socket.id);
    if (peer) {
      peer.transports.forEach(tid => {
        room.transports.get(tid)?.close();
        room.transports.delete(tid);
      });
      room.peers.delete(socket.id);
    }
    if (room.peers.size === 0) closeRoom(roomId);

    await redis.publish('mediasoup:peer:left',
      JSON.stringify({ streamId: roomId, userId, nodeId: NODE_ID })).catch(() => {});
  });
});

// ── Redis heartbeat (node discovery) ─────────────────────────────────────────
async function heartbeat(): Promise<void> {
  await redis.setex(`mediasoup:node:${NODE_ID}`, 30, JSON.stringify({
    nodeId: NODE_ID, region: REGION,
    host: process.env.HOST ?? os.hostname(),
    port: PORT,
    workers: workers.length,
    rooms:   rooms.size,
  })).catch(() => {});
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await initWorkers();
  await heartbeat();
  setInterval(heartbeat, 10_000);

  http.listen(PORT, () =>
    console.log(`mediasoup-server :${PORT}  nodeId=${NODE_ID}  region=${REGION}  workers=${workers.length}`));
}

main().catch(console.error);
