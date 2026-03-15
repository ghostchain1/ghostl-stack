import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { getDb } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Missing token'));
    try {
      const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      (socket as Socket & { userId: string }).userId = payload['userId'] as string;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    logger.info(`Socket connected: ${socket.id} user=${userId}`);

    // -- Stream room --
    socket.on('join_stream', ({ streamId }: { streamId: string }) => {
      socket.join(streamId);
      const db = getDb();
      db.prepare('UPDATE streams SET viewer_count=viewer_count+1 WHERE id=?').run(streamId);
      const stream = db.prepare('SELECT viewer_count FROM streams WHERE id=?').get(streamId) as
        | { viewer_count: number }
        | undefined;
      io.to(streamId).emit('viewer_update', { streamId, count: stream?.viewer_count ?? 0 });
    });

    socket.on('leave_stream', ({ streamId }: { streamId: string }) => {
      socket.leave(streamId);
      const db = getDb();
      db.prepare('UPDATE streams SET viewer_count=MAX(0,viewer_count-1) WHERE id=?').run(streamId);
      const stream = db.prepare('SELECT viewer_count FROM streams WHERE id=?').get(streamId) as
        | { viewer_count: number }
        | undefined;
      io.to(streamId).emit('viewer_update', { streamId, count: stream?.viewer_count ?? 0 });
    });

    socket.on('chat', ({ streamId, text }: { streamId: string; text: string }) => {
      if (!text?.trim() || !streamId) return;
      io.to(streamId).emit('chat_message', {
        senderId: userId,
        text: text.trim().slice(0, 200), // truncate for safety
        streamId,
        ts: Date.now(),
      });
    });

    // -- Agency chat --
    socket.on('join_agency', ({ agencyId }: { agencyId: string }) => {
      socket.join(`agency:${agencyId}`);
    });

    socket.on('leave_agency', ({ agencyId }: { agencyId: string }) => {
      socket.leave(`agency:${agencyId}`);
    });

    socket.on('agency_chat', ({ agencyId, text }: { agencyId: string; text: string }) => {
      if (!text?.trim()) return;
      io.to(`agency:${agencyId}`).emit('agency_message', {
        senderId: userId,
        agencyId,
        text: text.trim().slice(0, 500),
        ts: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}
