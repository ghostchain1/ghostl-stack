// memory-swap-manager.ts — VM memory swap management via virsh
// Handles NATS directives from GhostBrain Core to adjust VM memory
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { logger } from './logger.js';
import type { MemorySwapDirective, MemorySwapOutcome } from './types.js';

const execAsync = promisify(exec);

async function virshExec(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(`virsh ${args.map(a => `'${a}'`).join(' ')}`, {
      timeout: 30_000,
    });
    return { ok: true, output: (stdout + stderr).trim() };
  } catch (err: unknown) {
    const out = err instanceof Error ? (err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stdout ?? err.message : String(err);
    return { ok: false, output: out.toString().trim() };
  }
}

/** Adjust (swap out = reduce) VM memory by setting max to current - requested */
async function swapOut(vm: string, amountMiB: number): Promise<{ ok: boolean; detail: string }> {
  // Get current memory in KiB
  const info = await virshExec(['domstats', vm, '--balloon']);
  if (!info.ok) return { ok: false, detail: `domstats failed: ${info.output}` };

  // Parse current memory: balloon.current=<KiB>
  const match = info.output.match(/balloon\.current=(\d+)/);
  if (!match) return { ok: false, detail: `Could not parse balloon.current from domstats` };

  const currentKiB = parseInt(match[1], 10);
  const targetKiB = Math.max(65_536, currentKiB - amountMiB * 1024); // floor 64 MiB
  const result = await virshExec(['setmem', vm, String(targetKiB)]);
  return { ok: result.ok, detail: result.ok ? `Set memory to ${targetKiB} KiB` : result.output };
}

/** Increase VM memory back toward maximum */
async function swapIn(vm: string, amountMiB: number): Promise<{ ok: boolean; detail: string }> {
  // Get current and max memory
  const info = await virshExec(['domstats', vm, '--balloon']);
  if (!info.ok) return { ok: false, detail: `domstats failed: ${info.output}` };

  const currMatch = info.output.match(/balloon\.current=(\d+)/);
  const maxMatch = info.output.match(/balloon\.maximum=(\d+)/);
  if (!currMatch) return { ok: false, detail: `Could not parse balloon.current` };

  const currentKiB = parseInt(currMatch[1], 10);
  const maxKiB = maxMatch ? parseInt(maxMatch[1], 10) : currentKiB + amountMiB * 1024;
  const targetKiB = Math.min(maxKiB, currentKiB + amountMiB * 1024);
  const result = await virshExec(['setmem', vm, String(targetKiB)]);
  return { ok: result.ok, detail: result.ok ? `Set memory to ${targetKiB} KiB` : result.output };
}

/** Force memory compaction inside the domain (requires balloon driver + kernel support) */
async function compact(vm: string): Promise<{ ok: boolean; detail: string }> {
  const result = await virshExec(['domstats', vm, '--balloon']);
  // virsh doesn't have a direct compact command — trigger via balloon deflate/inflate cycle
  if (!result.ok) return { ok: false, detail: `domstats failed: ${result.output}` };

  const match = result.output.match(/balloon\.current=(\d+)/);
  if (!match) return { ok: false, detail: `Could not parse balloon.current` };

  const currentKiB = parseInt(match[1], 10);
  // Deflate by 5%, then re-inflate — triggers page compaction in guest
  const deflatedKiB = Math.max(65_536, Math.floor(currentKiB * 0.95));
  const deflate = await virshExec(['setmem', vm, String(deflatedKiB)]);
  if (!deflate.ok) return { ok: false, detail: `Compact deflate failed: ${deflate.output}` };

  await new Promise(r => setTimeout(r, 500));
  const reinflate = await virshExec(['setmem', vm, String(currentKiB)]);
  return {
    ok: reinflate.ok,
    detail: reinflate.ok ? `Compact cycle complete (${deflatedKiB}→${currentKiB} KiB)` : reinflate.output,
  };
}

/** Query current memory stats for a VM */
async function query(vm: string): Promise<{ ok: boolean; detail: string }> {
  const result = await virshExec(['domstats', vm, '--balloon']);
  return { ok: result.ok, detail: result.output };
}

/** Handle a MemorySwapDirective from GhostBrain Core */
export async function handleSwapDirective(directive: MemorySwapDirective): Promise<MemorySwapOutcome> {
  const { directiveId, workloadId, action, targetVm, swapAmountMiB = 256 } = directive;
  const executedAt = new Date().toISOString();

  if (!targetVm && action !== 'query') {
    return { directiveId, workloadId, action, ok: false, detail: 'targetVm required for this action', executedAt };
  }

  logger.info('Memory swap directive executing', { directiveId, workloadId, action, targetVm, swapAmountMiB });

  let result: { ok: boolean; detail: string };

  try {
    switch (action) {
      case 'swap_out': result = await swapOut(targetVm!, swapAmountMiB); break;
      case 'swap_in':  result = await swapIn(targetVm!, swapAmountMiB); break;
      case 'compact':  result = await compact(targetVm!); break;
      case 'query':    result = await query(targetVm ?? '*'); break;
      default:         result = { ok: false, detail: `Unknown action: ${String(action)}` };
    }
  } catch (err) {
    result = { ok: false, detail: String(err) };
  }

  logger.info('Memory swap directive complete', { directiveId, workloadId, action, ok: result.ok });
  return { directiveId, workloadId, action, ok: result.ok, detail: result.detail, executedAt };
}
