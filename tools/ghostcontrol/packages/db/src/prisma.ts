import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __ghostcontrolPrisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (globalThis.__ghostcontrolPrisma) return globalThis.__ghostcontrolPrisma;
  const client = new PrismaClient();
  globalThis.__ghostcontrolPrisma = client;
  return client;
}

