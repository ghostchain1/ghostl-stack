/**
 * @file src/storage/cas.js
 * @description Content-addressable storage for findings, plans, and bundles.
 *
 * Stores JSON artifacts keyed by sha256(content).
 * Layout: {bundleDir}/{prefix}/{hash[0..1]}/{hash}.json
 *
 * Zero external deps — uses node:fs + node:crypto only.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

const ROOT = config.bundleDir;

function pathFor(hash, prefix = 'artifacts') {
  return join(ROOT, prefix, hash.slice(0, 2), `${hash}.json`);
}

function ensureDir(p) {
  mkdirSync(p.replace(/\/[^/]+\.json$/, ''), { recursive: true });
}

/**
 * Store an artifact. Returns the sha256 content hash (hex).
 * @param {unknown} obj  - JSON-serialisable object
 * @param {string} [prefix] - storage prefix (default: 'artifacts')
 * @returns {string} sha256 hex hash
 */
export function put(obj, prefix = 'artifacts') {
  const json = JSON.stringify(obj, null, 2);
  const hash = createHash('sha256').update(json).digest('hex');
  const p = pathFor(hash, prefix);
  ensureDir(p);
  if (!existsSync(p)) writeFileSync(p, json, 'utf8');
  return hash;
}

/**
 * Retrieve an artifact by hash.
 * @param {string} hash
 * @param {string} [prefix]
 * @returns {unknown|null}
 */
export function get(hash, prefix = 'artifacts') {
  const p = pathFor(hash, prefix);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Check whether a hash exists in the store.
 * @param {string} hash
 * @param {string} [prefix]
 * @returns {boolean}
 */
export function has(hash, prefix = 'artifacts') {
  return existsSync(pathFor(hash, prefix));
}

/**
 * Compute the sha256 of a JSON-serialisable value without storing it.
 * @param {unknown} obj
 * @returns {string}
 */
export function hashOf(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}
