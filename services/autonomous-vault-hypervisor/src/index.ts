// index.ts — entry point for autonomous-vault-hypervisor
import { CFG } from './config.js';
import { logger } from './logger.js';
import { loadPolicy } from './policy-gate.js';
import { connectGhostBrain, registerWithGhostBrainHttp, drainNats } from './ghostbrain.js';
import { startReconciler, stopReconciler } from './reconciler.js';
import { createApp } from './server.js';

async function main(): Promise<void> {
  logger.info('autonomous-vault-hypervisor starting', {
    port: CFG.port,
    vaultAddr: CFG.vaultAddr,
    aiVaultAddr: CFG.aiVaultAddr,
    natsUrl: CFG.natsUrl,
    ghostbrainEnabled: CFG.ghostbrainEnabled,
    dockerEnabled: CFG.dockerEnabled,
    sshEnabled: CFG.sshEnabled,
    remediateEnabled: CFG.remediateEnabled,
    rotateEnabled: CFG.rotateEnabled,
    executeActions: CFG.executeActions,
    emergencyLock: CFG.emergencyLock,
    reconcileIntervalMs: CFG.reconcileIntervalMs,
  });

  // 1. Load policy
  loadPolicy();

  // 2. Connect to GhostBrain (NATS + HTTP registration — non-blocking)
  void connectGhostBrain();
  void registerWithGhostBrainHttp();

  // 3. Start reconciliation loop
  startReconciler();

  // 4. Start HTTP server
  const app = createApp();
  const server = app.listen(CFG.port, '0.0.0.0', () => {
    logger.info('HTTP server listening', { port: CFG.port, address: '0.0.0.0' });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    stopReconciler();
    await drainNats();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err: String(err), stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
}

void main();
