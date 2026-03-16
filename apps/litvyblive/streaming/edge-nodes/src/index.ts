/**
 * LitVybzLive — Edge Node
 * Regional MediaSoup SFU relay for global viewer distribution
 *
 * Port: 3003 (HTTP + Socket.IO)
 * Ports: 41000-41999/udp (WebRTC RTP)
 *
 * Architecture:
 *   - Each edge node runs its own mediasoup worker
 *   - Connects to the core mediasoup-server to "pipe" streams
 *   - Local viewers connect to this node for lower latency
 *   - Registers itself in Redis for discovery
 *
 * Pipe transport flow:
 *   Core Router ──PipeTransport──▶ Edge Router ──WebRtcTransport──▶ Viewer
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import * as mediasoup from 'mediasoup';
import Redis from 'ioredis';
import os from 'os';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT           ?? '3003', 10);
const REDIS_URL      = process.env.REDIS_URL               ?? 'redis://redis:6379';
const ANNOUNCED_IP   = process.env.ANNOUNCED_IP            ?? '127.0.0.1';
const CORE_WS_URL    = process.env.CORE_MEDIASOUP_URL      ?? 'ws://mediasoup-server:3000';
const CORE_HTTP_URL  = process.env.CORE_HTTP_URL           ?? 'http://mediasoup-server:3000';
const RTC_MIN        = parseInt(process.env.RTC_MIN_PORT   ?? '41000', 10);
const RTC_MAX        = parseInt(process.env.RTC_MAX_PORT   ?? '41999', 10);
const REGION         = process.env.REGION                  ?? 'edge-default';
const NODE_ID        = process.env.NODE_ID                 ?? `edge-${REGION}-${os.hostname()}`;

// ── Types ─────────────────────────────────────────────────────────────────────
const MEDIA_CODECS: mediasoup.types.RtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2,
    preferredPayloadType: 100 },
  { kind: 'video', mimeType: 'video/VP8',  clockRate: 90000,
    preferredPayloadType: 96,
    parameters: { 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/VP9',  clockRate: 90000,
    preferredPayloadType: 101,
    parameters: { 'profile-id': 2, 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/h264', clockRate: 90000,
    preferredPayloadType: 102,
    parameters: { 'packetization-mode': 1, 'profile-level-id': '4d0032',
                  'level-asymmetry-allowed': 1 } },
];

interface EdgeRoom {
  streamId:      string;
  localRouter:   mediasoup.types.Router;
  transports:    Map<string, mediasoup.types.WebRtcTransport>;
  pipeTransport: mediasoup.types.PipeTransport | null;
  producers:     Map<string, mediasoup.types.Producer>; // piped from core
  consumers:     Map<string, mediasoup.types.Consumer>; // local viewers
  viewers:       Set<string>; // socketIds
}

// ── State ─────────────────────────────────────────────────────────────────────
let   worker:     mediasoup.types.Worker | null = null;
const edgeRooms = new Map<string, EdgeRoom>();

// Connection to core mediasoup-server for signaling
let coreSocket: ClientSocket | null = null;

// ── Worker ────────────────────────────────────────────────────────────────────
async function initWorker(): Promise<void> {
  worker = await mediasoup.createWorker({
    logLevel: 'warn', rtcMinPort: RTC_MIN, rtcMaxPort: RTC_MAX,
  });
  worker.on('died', async (err) => {
    console.error('[edge] Worker died:', err?.message);
    worker = null;
    setTimeout(async () => { await initWorker(); }, 2000);
  });
  console.log(`[edge] Worker ready (pid: ${worker.pid})`);
}

// ── Core socket connection ────────────────────────────────────────────────────
function connectToCore(): void {
  coreSocket = ioClient(CORE_WS_URL, {
    query:      { userId: NODE_ID },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
  });

  coreSocket.on('connect',    () => console.log(`[edge] Connected to core: ${CORE_WS_URL}`));
  coreSocket.on('disconnect', (r) => console.log(`[edge] Disconnected from core: ${r}`));

  // When core emits newProducer, pipe it to all edge rooms that are watching that stream
  coreSocket.on('newProducer', ({ streamId, producerId, kind }: {
    streamId: string; producerId: string; kind: mediasoup.types.MediaKind;
  }) => {
    const room = edgeRooms.get(streamId);
    if (room && room.pipeTransport) {
      pipeProducerToEdge(room, producerId).catch(console.error);
    }
  });
}

// ── Pipe: bring a core producer into this edge router ─────────────────────────
async function pipeProducerToEdge(room: EdgeRoom, coreProducerId: string): Promise<void> {
  if (!worker) return;

  // Create local pipe transport if not exists
  if (!room.pipeTransport) {
    const pt = await room.localRouter.createPipeTransport({
      listenIp: { ip: '0.0.0.0', announcedIp: ANNOUNCED_IP },
      enableSctp: true, enableRtx: true, enableSrtp: true,
    });
    room.pipeTransport = pt;

    // Request core to create matching pipe transport and connect both ends
    // (in production this would be a REST call to the core server)
    // For this implementation we use the existing consume mechanism
  }

  // Consume from core via the coreSocket
  if (!coreSocket?.connected) return;

  coreSocket.emit('consume', {
    streamId:       room.streamId,
    transportId:    'pipe-transport-id', // would be set up properly
    producerId:     coreProducerId,
    rtpCapabilities: room.localRouter.rtpCapabilities,
  }, (resp: { consumerId?: string; error?: string; rtpParameters?: mediasoup.types.RtpParameters; kind?: mediasoup.types.MediaKind }) => {
    if (resp.error) { console.error('[edge] Consume error:', resp.error); return; }
    console.log(`[edge] Piped producer ${coreProducerId} → edge room ${room.streamId}`);
  });
}

// ── Get or create an edge room ────────────────────────────────────────────────
async function getOrCreateEdgeRoom(streamId: string): Promise<EdgeRoom> {
  const existing = edgeRooms.get(streamId);
  if (existing) return existing;
  if (!worker) throw new Error('Worker not ready');

  const localRouter = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });

  // Join the stream on the core server so we receive newProducer events
  if (coreSocket?.connected) {
    coreSocket.emit('joinRoom', { streamId, role: 'consumer' }, (resp: { error?: string }) => {
      if (resp.error) console.warn(`[edge] joinRoom error: ${resp.error}`);
    });
  }

  const room: EdgeRoom = {
    streamId, localRouter, transports: new Map(),
    pipeTransport: null, producers: new Map(), consumers: new Map(), viewers: new Set(),
  };
  edgeRooms.set(streamId, room);
  console.log(`[edge] Room created: ${streamId}`);
  return room;
}

function closeEdgeRoom(streamId: string): void {
  const room = edgeRooms.get(streamId);
  if (!room) return;
  room.localRouter.close();
  edgeRooms.delete(streamId);
  console.log(`[edge] Room closed: ${streamId}`);
}

// ── App ───────────────────────────────────────────────────────────────────────
const app  = express();
const http = createServer(app);
const io   = new SocketIO(http, { cors: { origin: '*' } });
const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => console.warn('[redis] unavailable'));

app.use(express.json());

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:     'ok',
    nodeId:     NODE_ID,
    region:     REGION,
    rooms:      edgeRooms.size,
    coreOnline: coreSocket?.connected ?? false,
    uptime:     process.uptime(),
  });
});

app.get('/rooms', (_req, res) => {
  const list = Array.from(edgeRooms.values()).map(r => ({
    streamId: r.streamId,
    viewers:  r.viewers.size,
    producers: r.producers.size,
    consumers: r.consumers.size,
  }));
  res.json(list);
});

// ── Socket.IO — local viewer signaling ───────────────────────────────────────
io.on('connection', (socket) => {
  const userId = (socket.handshake.query.userId as string) ?? 'anon';
  let currentStreamId: string | null = null;

  socket.on('joinRoom',
    async (
      { streamId }: { streamId: string },
      cb: (v: { rtpCapabilities: mediasoup.types.RtpCapabilities } | { error: string }) => void,
    ) => {
      try {
        const room = await getOrCreateEdgeRoom(streamId);
        currentStreamId = streamId;
        socket.join(streamId);
        room.viewers.add(socket.id);
        cb({ rtpCapabilities: room.localRouter.rtpCapabilities });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  socket.on('createTransport',
    async (
      { streamId }: { streamId: string },
      cb: (v: {
        id: string; iceParameters: mediasoup.types.IceParameters;
        iceCandidates: mediasoup.types.IceCandidate[]; dtlsParameters: mediasoup.types.DtlsParameters;
      } | { error: string }) => void,
    ) => {
      try {
        const room = edgeRooms.get(streamId);
        if (!room) return cb({ error: 'room not found' });
        const t = await room.localRouter.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
          enableUdp: true, enableTcp: true, preferUdp: true,
        });
        t.on('dtlsstatechange', (s) => { if (s === 'failed' || s === 'closed') t.close(); });
        room.transports.set(t.id, t);
        cb({ id: t.id, iceParameters: t.iceParameters, iceCandidates: t.iceCandidates,
             dtlsParameters: t.dtlsParameters });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  socket.on('connectTransport',
    async (
      { streamId, transportId, dtlsParameters }:
        { streamId: string; transportId: string; dtlsParameters: mediasoup.types.DtlsParameters },
      cb: (v: { connected: boolean } | { error: string }) => void,
    ) => {
      try {
        const t = edgeRooms.get(streamId)?.transports.get(transportId);
        if (!t) return cb({ error: 'transport not found' });
        await t.connect({ dtlsParameters });
        cb({ connected: true });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  // Viewers consume from the edge router (which has piped producers from core)
  socket.on('consume',
    async (
      { streamId, transportId, producerId, rtpCapabilities }:
        { streamId: string; transportId: string; producerId: string;
          rtpCapabilities: mediasoup.types.RtpCapabilities },
      cb: (v: { consumerId: string; producerId: string; kind: mediasoup.types.MediaKind;
                rtpParameters: mediasoup.types.RtpParameters } | { error: string }) => void,
    ) => {
      try {
        const room = edgeRooms.get(streamId);
        const t    = room?.transports.get(transportId);
        if (!room || !t) return cb({ error: 'transport not found' });

        if (!room.localRouter.canConsume({ producerId, rtpCapabilities }))
          return cb({ error: 'cannot consume' });

        const c = await t.consume({ producerId, rtpCapabilities, paused: true });
        room.consumers.set(c.id, c);
        c.on('transportclose', () => room.consumers.delete(c.id));
        c.on('producerclose', () => {
          room.consumers.delete(c.id);
          socket.emit('consumerClosed', { consumerId: c.id });
        });
        cb({ consumerId: c.id, producerId, kind: c.kind, rtpParameters: c.rtpParameters });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  socket.on('resumeConsumer',
    async (
      { streamId, consumerId }: { streamId: string; consumerId: string },
      cb: (v: { resumed: boolean } | { error: string }) => void,
    ) => {
      try {
        const c = edgeRooms.get(streamId)?.consumers.get(consumerId);
        if (!c) return cb({ error: 'consumer not found' });
        await c.resume();
        cb({ resumed: true });
      } catch (e: unknown) { cb({ error: (e as Error).message }); }
    },
  );

  socket.on('getProducers',
    ({ streamId }: { streamId: string },
     cb: (v: Array<{ producerId: string; kind: mediasoup.types.MediaKind }>) => void) => {
      const room = edgeRooms.get(streamId);
      if (!room) return cb([]);
      cb(Array.from(room.producers.values()).map(p => ({ producerId: p.id, kind: p.kind })));
    },
  );

  socket.on('disconnect', () => {
    if (!currentStreamId) return;
    const room = edgeRooms.get(currentStreamId);
    if (!room) return;
    room.viewers.delete(socket.id);
    if (room.viewers.size === 0) closeEdgeRoom(currentStreamId);
  });
});

// ── Redis heartbeat ───────────────────────────────────────────────────────────
async function heartbeat(): Promise<void> {
  await redis.setex(`mediasoup:edge:${NODE_ID}`, 30, JSON.stringify({
    nodeId: NODE_ID, region: REGION,
    host:   process.env.HOST ?? os.hostname(),
    port:   PORT,
    rooms:  edgeRooms.size,
    coreUrl: CORE_WS_URL,
  })).catch(() => {});
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await initWorker();
  connectToCore();
  await heartbeat();
  setInterval(heartbeat, 10_000);

  http.listen(PORT, () =>
    console.log(`edge-node :${PORT}  nodeId=${NODE_ID}  region=${REGION}  core=${CORE_WS_URL}`));
}

main().catch(console.error);
