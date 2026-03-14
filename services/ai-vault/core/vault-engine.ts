/**
 * GhostStack AI Vault — Vault Engine
 * Central orchestrator for the entire AI Vault system.
 * Wires all subsystems together: crypto, storage, AI, agents, and API.
 *
 * Startup sequence:
 *   1. Load config
 *   2. Init crypto master key
 *   3. Init storage (EncryptedStore, KeyDatabase, AuditLedger)
 *   4. Init AI brain (SecurityBrain)
 *   5. Init core managers (SecretManager, KeyManager, PolicyEngine)
 *   6. Init blockchain managers (Validator, Bridge, Treasury, Sequencer)
 *   7. Start background workers
 *   8. Start REST API
 *   9. Start autonomous agents
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { SecureKey, deriveKeyScrypt, randomHex } from '../core/crypto-engine.js';
import { EncryptedStore } from '../storage/encrypted-store.js';
import { KeyDatabase } from '../storage/key-database.js';
import { AuditLedger } from '../storage/audit-ledger.js';
import { SnapshotBackup } from '../storage/snapshot-backup.js';
import { SecretManager } from '../core/secret-manager.js';
import { KeyManager } from '../core/key-manager.js';
import { PolicyEngine } from '../core/policy-engine.js';
import { SecurityBrain } from '../ai/security-brain.js';
import { AnomalyDetector } from '../ai/anomaly-detector.js';
import { AccessBehaviorModel } from '../ai/access-behavior-model.js';
import { RiskAnalyzer } from '../ai/risk-analyzer.js';
import { ThreatPredictor } from '../ai/threat-predictor.js';
import { SecretRotationAI } from '../ai/secret-rotation-ai.js';
import { ValidatorKeyGuardian } from '../blockchain/validator-key-guardian.js';
import { BridgeKeyManager } from '../blockchain/bridge-key-manager.js';
import { TreasuryKeyManager } from '../blockchain/treasury-key-manager.js';
import { SequencerKeyManager } from '../blockchain/sequencer-key-manager.js';
import { MultisigController } from '../blockchain/multisig-controller.js';
import { VaultApi } from '../api/vault-api.js';
import { VaultGuardianAgent } from '../agents/vault-guardian-agent.js';
import { KeyRotationAgent } from '../agents/key-rotation-agent.js';
import { ThreatResponseAgent } from '../agents/threat-response-agent.js';
import { ComplianceAgent } from '../agents/compliance-agent.js';
import { RotationWorker } from '../workers/rotation-worker.js';
import { AuditWorker } from '../workers/audit-worker.js';
import { loadVaultConfig, type VaultConfig } from '../config/vault-config.js';

// ── VaultEngine ────────────────────────────────────────────────────────────

export class VaultEngine {
  private _config!: VaultConfig;
  private _masterKey!: SecureKey;

  // Storage layer
  private _store!:    EncryptedStore;
  private _keyDb!:    KeyDatabase;
  private _audit!:    AuditLedger;
  private _snapshot!: SnapshotBackup;

  // Core managers
  private _secretMgr!:  SecretManager;
  private _keyMgr!:     KeyManager;
  private _policyEng!:  PolicyEngine;

  // AI layer
  private _brain!: SecurityBrain;

  // Blockchain managers
  private _validatorGuardian!: ValidatorKeyGuardian;
  private _bridgeMgr!:         BridgeKeyManager;
  private _treasuryMgr!:       TreasuryKeyManager;
  private _sequencerMgr!:      SequencerKeyManager;
  private _multisig!:          MultisigController;

  // API + Agents + Workers
  private _api!:              VaultApi;
  private _guardianAgent!:    VaultGuardianAgent;
  private _rotationAgent!:    KeyRotationAgent;
  private _threatAgent!:      ThreatResponseAgent;
  private _complianceAgent!:  ComplianceAgent;
  private _rotationWorker!:   RotationWorker;
  private _auditWorker!:      AuditWorker;

  private _running = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._running) throw new Error('VaultEngine already running');

    console.info('[VaultEngine] Starting GhostStack Autonomous AI Vault…');

    // 1. Config
    this._config = loadVaultConfig();
    console.info(`[VaultEngine] Config loaded — db: ${this._config.dbPath}`);

    // 2. Master key (derived from env secret + salt)
    this._masterKey = await this._initMasterKey();
    console.info('[VaultEngine] Master key initialized');

    // 3. Storage
    this._store    = new EncryptedStore(this._config.dbPath, this._masterKey, this._config.encryptionAlgorithm);
    this._keyDb    = new KeyDatabase(this._config.auditDbPath.replace('audit.db', 'keys.db'));
    this._audit    = new AuditLedger(this._config.auditDbPath);
    this._snapshot = new SnapshotBackup(
      this._config.snapshotDir,
      this._masterKey,
      this._audit,
    );
    console.info('[VaultEngine] Storage layer ready');

    // 4. Policy engine (must be before RiskAnalyzer which depends on it)
    this._policyEng = new PolicyEngine(this._config.policyPath, this._config.policyWrite);

    // 5. AI brain
    const anomalyDetector = new AnomalyDetector();
    const behaviorModel   = new AccessBehaviorModel();
    const riskAnalyzer    = new RiskAnalyzer(this._policyEng);
    const threatPredictor = new ThreatPredictor();
    const rotationAI      = new SecretRotationAI();
    this._brain = new SecurityBrain(
      anomalyDetector, behaviorModel, riskAnalyzer, threatPredictor, rotationAI,
    );
    console.info('[VaultEngine] AI SecurityBrain initialized');

    // 6. Core managers
    this._secretMgr = new SecretManager(this._store, this._audit, this._policyEng);
    this._keyMgr    = new KeyManager(this._store, this._keyDb, this._audit, this._masterKey);

    // 7. Blockchain managers
    this._validatorGuardian = new ValidatorKeyGuardian(this._keyMgr, this._audit, this._brain);
    this._bridgeMgr         = new BridgeKeyManager(this._keyMgr, this._audit, this._brain);
    this._treasuryMgr       = new TreasuryKeyManager(this._keyMgr, this._audit, this._brain);
    this._sequencerMgr      = new SequencerKeyManager(this._keyMgr, this._audit, this._brain);
    this._multisig          = new MultisigController(this._keyMgr, this._audit);
    console.info('[VaultEngine] Blockchain key managers ready');

    // 8. REST API
    this._api = new VaultApi(
      this._config,
      this._audit,
      this._secretMgr,
      this._keyMgr,
      this._brain,
    );
    await this._api.start();
    console.info(`[VaultEngine] REST API listening on port ${this._config.port}`);

    // 9. Workers
    this._rotationWorker = new RotationWorker(this._keyMgr, this._secretMgr, this._brain, this._audit);
    this._auditWorker    = new AuditWorker(this._audit, this._config);
    this._rotationWorker.start();
    this._auditWorker.start();

    // 10. Autonomous Agents
    this._guardianAgent   = new VaultGuardianAgent(this._brain, this._audit);
    this._rotationAgent   = new KeyRotationAgent(this._keyMgr, this._secretMgr, this._brain, this._audit);
    this._threatAgent     = new ThreatResponseAgent(this._brain, this._keyMgr, this._secretMgr, this._audit);
    this._complianceAgent = new ComplianceAgent(this._audit, this._policyEng, this._config);
    this._guardianAgent.start();
    this._rotationAgent.start();
    this._threatAgent.start();
    this._complianceAgent.start();
    console.info('[VaultEngine] Autonomous agents started');

    this._audit.append({
      actor: 'system', actorType: 'vault', resource: 'vault://system', action: 'vault.start',
      result: 'success', riskScore: 0, message: 'GhostStack AI Vault started',
    });

    this._running = true;
    console.info('[VaultEngine] ✓ GhostStack Autonomous AI Vault is ONLINE');
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    console.info('[VaultEngine] Graceful shutdown initiated…');

    this._guardianAgent?.stop();
    this._rotationAgent?.stop();
    this._threatAgent?.stop();
    this._complianceAgent?.stop();
    this._rotationWorker?.stop();
    this._auditWorker?.stop();
    await this._api?.stop();

    this._audit.append({
      actor: 'system', actorType: 'vault', resource: 'vault://system', action: 'vault.stop',
      result: 'success', riskScore: 0, message: 'GhostStack AI Vault stopped',
    });

    this._masterKey.wipe();
    this._running = false;
    console.info('[VaultEngine] Vault stopped cleanly');
  }

  // ── Accessors (for testing / CLI) ────────────────────────────────────────────

  get secretManager():      SecretManager       { return this._secretMgr; }
  get keyManager():         KeyManager          { return this._keyMgr; }
  get policyEngine():       PolicyEngine        { return this._policyEng; }
  get securityBrain():      SecurityBrain       { return this._brain; }
  get validatorGuardian():  ValidatorKeyGuardian { return this._validatorGuardian; }
  get bridgeKeyManager():   BridgeKeyManager    { return this._bridgeMgr; }
  get treasuryKeyManager(): TreasuryKeyManager  { return this._treasuryMgr; }
  get sequencerKeyManager(): SequencerKeyManager { return this._sequencerMgr; }
  get multisigController(): MultisigController  { return this._multisig; }
  get auditLedger():        AuditLedger         { return this._audit; }
  get isRunning():          boolean             { return this._running; }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _initMasterKey(): Promise<SecureKey> {
    const rawSecret = process.env['VAULT_MASTER_SECRET'];
    if (!rawSecret) {
      throw new Error(
        'VAULT_MASTER_SECRET environment variable is not set. ' +
        'The vault cannot start without a master secret.'
      );
    }
    const saltHex = process.env['VAULT_MASTER_SALT'] ?? randomHex(32);
    const salt    = Buffer.from(saltHex, 'hex');
    const keyBuf  = deriveKeyScrypt(rawSecret, salt);
    return keyBuf;
  }
}

// ── Singleton entrypoint ───────────────────────────────────────────────────

let _instance: VaultEngine | undefined;

export function getVaultEngine(): VaultEngine {
  if (!_instance) _instance = new VaultEngine();
  return _instance;
}

// ── Main ───────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('vault-engine.ts') || process.argv[1]?.endsWith('vault-engine.js')) {
  const engine = getVaultEngine();

  const shutdown = async (sig: string) => {
    console.info(`\n[VaultEngine] Received ${sig}, shutting down…`);
    await engine.stop();
    process.exit(0);
  };

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  engine.start().catch(err => {
    console.error('[VaultEngine] Fatal startup error:', err);
    process.exit(1);
  });
}
