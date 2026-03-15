import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { authRouter } from './routes/auth.js';
import { streamsRouter } from './routes/streams.js';
import { giftsRouter } from './routes/gifts.js';
import { walletRouter } from './routes/wallet.js';
import { usersRouter } from './routes/users.js';
import { agencyRouter } from './routes/agency.js';
import { rankingsRouter } from './routes/rankings.js';
import { eventsRouter } from './routes/events.js';
import { gamesRouter } from './routes/games.js';
import { socialRouter } from './routes/social.js';
import { nftRouter } from './routes/nft.js';
import { adminRouter } from './routes/admin.js';
import { identityRouter } from './routes/identity.js';
import { launchpadRouter } from './routes/launchpad.js';
import { multiverseRouter } from './routes/multiverse.js';
import { economyRouter } from './routes/economy.js';
import { marketingRouter } from './routes/marketing.js';
import { paymentsRouter }      from './routes/payments.js';
import { securityRouter }       from './routes/security.js';
import { infrastructureRouter } from './routes/infrastructure.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { logger } from './utils/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const PORT = Number(process.env.PORT ?? 7001);

const app = express();
const httpServer = createServer(app);

// -- Security --
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(rateLimiter);

// -- Health --
app.get('/health', (_req, res) => res.json({ status: 'ok', chain: 903 }));

// -- Public routes --
app.use('/auth', authRouter);

// Identity: check/resolve/profile are public; mutations require auth (handled inside router)
app.use('/identity', identityRouter);

// -- Protected routes --
app.use(authMiddleware);
app.use('/streams', streamsRouter);
app.use('/gifts', giftsRouter);
app.use('/wallet', walletRouter);
app.use('/users', usersRouter);
app.use('/agency', agencyRouter);
app.use('/rankings', rankingsRouter);
app.use('/events', eventsRouter);
app.use('/games', gamesRouter);
app.use('/social', socialRouter);
app.use('/nft', nftRouter);
app.use('/admin', adminRouter);
app.use('/launchpad', launchpadRouter);
app.use('/multiverse', multiverseRouter);
app.use('/economy', economyRouter);
app.use('/marketing',       marketingRouter);
app.use('/payments',        paymentsRouter);
app.use('/security',        securityRouter);
app.use('/infrastructure',  infrastructureRouter);

// -- Socket.IO --
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket'],
});
registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  logger.info(`LitVybzLive backend running on :${PORT} (GhostL3 chain 903)`);
});

export { io };
