import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8090),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3200'),
  ATTESTATION_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  ATTESTATION_EXPIRY_SECONDS: z.coerce.number().default(900)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid compliance env: ${parsed.error.message}`);
}

export const config = {
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  logLevel: parsed.data.LOG_LEVEL,
  corsOrigin: parsed.data.CORS_ORIGIN,
  attestationPrivateKey: parsed.data.ATTESTATION_PRIVATE_KEY,
  attestationExpirySeconds: parsed.data.ATTESTATION_EXPIRY_SECONDS
};
