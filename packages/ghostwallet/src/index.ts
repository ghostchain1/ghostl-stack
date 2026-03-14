import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { HDNodeWallet, Wallet } from '@ghostchain/sdk';

type Envelope = {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
};

export type KeyMaterial = {
  address: string;
  privateKey: string;
  mnemonic?: string;
  derivationPath?: string;
};

const AES_ALG = 'aes-256-gcm';
const IV_BYTES = 12;

const decodeEnvKey = (raw: string): Buffer => {
  const trimmed = raw.trim();
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  const base64 = Buffer.from(trimmed, 'base64');
  if (base64.length === 32) {
    return base64;
  }
  const utf = Buffer.from(trimmed, 'utf8');
  if (utf.length === 32) {
    return utf;
  }
  throw new Error('Invalid master key: provide 32-byte hex or base64.');
};

export const loadMasterKey = (raw?: string): Buffer => {
  if (!raw) {
    throw new Error('Missing GhostWallet master key.');
  }
  return decodeEnvKey(raw);
};

export const encryptSecret = (plaintext: string, masterKey: Buffer): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALG, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: Envelope = {
    v: 1,
    alg: AES_ALG,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
};

export const decryptSecret = (payload: string, masterKey: Buffer): string => {
  const raw = Buffer.from(payload, 'base64').toString('utf8');
  const parsed = JSON.parse(raw) as Envelope;
  if (parsed.alg !== AES_ALG || parsed.v !== 1) {
    throw new Error('Unsupported encrypted payload.');
  }
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const data = Buffer.from(parsed.data, 'base64');
  const decipher = createDecipheriv(AES_ALG, masterKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

export const generateMnemonicWallet = (derivationPath?: string): KeyMaterial => {
  const wallet = HDNodeWallet.createRandom();
  const path = derivationPath || wallet.path || undefined;
  const derived = path ? HDNodeWallet.fromPhrase(wallet.mnemonic?.phrase || '', undefined, path) : wallet;
  return {
    address: derived.address,
    privateKey: derived.privateKey,
    mnemonic: wallet.mnemonic?.phrase || undefined,
    derivationPath: path
  };
};

export const walletFromMnemonic = (mnemonic: string, derivationPath?: string): KeyMaterial => {
  const path = derivationPath || "m/44'/60'/0'/0/0";
  const wallet = HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, path);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic,
    derivationPath: path
  };
};

export const walletFromPrivateKey = (privateKey: string): KeyMaterial => {
  const wallet = new Wallet(privateKey.trim());
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
};
