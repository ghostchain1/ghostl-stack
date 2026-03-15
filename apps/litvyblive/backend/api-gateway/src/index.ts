import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import jwt from 'jsonwebtoken';
import { createLogger, transports, format } from 'winston';

const PORT = Number(process.env.PORT ?? 7001);
const JWT_SECRET = process.env.JWT_SECRET ?? 'litvyblive-dev-secret';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '256kb' }));

// ── Global rate limit: 300 req/min per IP ─────────────────────────────────────
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway', chain: 903 }));

// ── JWT guard — skip /auth and /health ────────────────────────────────────────
const PUBLIC_PREFIXES = ['/auth', '/health'];

function jwtGuard(req: Request, res: Response, next: NextFunction): void {
  const isPublic = PUBLIC_PREFIXES.some(p => req.path.startsWith(p));
  if (isPublic) { next(); return; }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — Bearer token required' });
    return;
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
app.use(jwtGuard);

// ── Proxy route table ─────────────────────────────────────────────────────────
const routes: Record<string, string | undefined> = {
  '/auth':          process.env.AUTH_SVC,
  '/users':         process.env.USER_SVC,
  '/streams':       process.env.STREAM_SVC,
  '/chat':          process.env.CHAT_SVC,
  '/gifts':         process.env.GIFT_SVC,
  '/wallet':        process.env.WALLET_SVC,
  '/agency':        process.env.AGENCY_SVC,
  '/matchmaking':   process.env.MATCH_SVC,
  '/games':         process.env.GAMES_SVC,
  '/rankings':      process.env.RANKING_SVC,
  '/events':        process.env.EVENT_SVC,
  '/launchpad':     process.env.LAUNCHPAD_SVC,
  '/treasury':      process.env.TREASURY_SVC,
  '/marketing':     process.env.MARKETING_SVC,
  '/fraud':         process.env.FRAUD_SVC,
  '/analytics':     process.env.ANALYTICS_SVC,
  '/notifications': process.env.NOTIFICATION_SVC,
};

// Default fallbacks for local dev
const DEFAULTS: Record<string, string> = {
  '/auth': 'http://localhost:7010', '/users': 'http://localhost:7011',
  '/streams': 'http://localhost:7012', '/chat': 'http://localhost:7013',
  '/gifts': 'http://localhost:7014', '/wallet': 'http://localhost:7015',
  '/agency': 'http://localhost:7016', '/matchmaking': 'http://localhost:7017',
  '/games': 'http://localhost:7018', '/rankings': 'http://localhost:7019',
  '/events': 'http://localhost:7020', '/launchpad': 'http://localhost:7021',
  '/treasury': 'http://localhost:7022', '/marketing': 'http://localhost:7023',
  '/fraud': 'http://localhost:7024', '/analytics': 'http://localhost:7025',
  '/notifications': 'http://localhost:7026',
};

for (const [prefix, envTarget] of Object.entries(routes)) {
  const target = envTarget ?? DEFAULTS[prefix]!;
  app.use(
    prefix,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      on: {
        proxyReq: fixRequestBody,
        error: (_err: Error, _req: Request, res: Response) => {
          log.error(`Proxy error → ${target}: service unreachable`);
          res.status(502).json({ error: 'Upstream service unavailable' });
        },
      },
    }),
  );
  log.info(`Proxying ${prefix} → ${target}`);
}

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => log.info(`API Gateway running on :${PORT} (18 upstream services)`));
