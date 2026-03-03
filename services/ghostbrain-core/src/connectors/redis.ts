/**
 * GhostBrain Core — Redis Connector
 *
 * Provides a singleton ioredis client used by the memory-swap advisor
 * and other GhostBrain subsystems.  Connection is lazy: the client is
 * created on first call to getRedis().
 */

import { Redis } from "ioredis";
import { REDIS_URL } from "../config.js";
import { logger } from "../logger.js";

let _client: Redis | null = null;

export function getRedis(): Redis {
  if (_client) return _client;

  _client = new Redis(REDIS_URL, {
    lazyConnect:            true,
    maxRetriesPerRequest:   3,
    enableReadyCheck:       true,
    enableOfflineQueue:     true,
    reconnectOnError:       (err: Error) => {
      const target = err.message.includes("READONLY");
      return target ? 1 : false;
    },
  });

  _client.on("connect",        () => logger.info("Redis connected",          { url: REDIS_URL }));
  _client.on("ready",          () => logger.debug("Redis ready"));
  _client.on("error",   (err: Error) => logger.warn("Redis error",            { err: String(err) }));
  _client.on("close",          () => logger.info("Redis connection closed"));
  _client.on("reconnecting",   () => logger.debug("Redis reconnecting"));

  // Initiate the connection (non-blocking for callers)
  _client.connect().catch((err: unknown) => {
    logger.warn("Redis initial connect failed — will retry", { err: String(err) });
  });

  return _client;
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
    logger.info("Redis disconnected");
  }
}
