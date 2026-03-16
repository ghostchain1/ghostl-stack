#!/usr/bin/env node
// GhostForge CLI — ghostforge build | test | deploy | scaffold | verify
import { GhostForge, GHOST_NETWORKS } from './index.js';

const [,, command, ...args] = process.argv;

const COMMANDS: Record<string, () => Promise<void>> = {
  build: async () => {
    const forge = new GhostForge({ profile: getFlag('--profile') ?? 'default' });
    const result = await forge.build({ skipTests: hasFlag('--skip-tests'), force: hasFlag('--force') });
    if (!result.success) {
      console.error('[GhostForge] Build failed:\n' + result.errors.join('\n'));
      process.exit(1);
    }
    console.log(`[GhostForge] Build succeeded — ${result.artifacts.length} artifacts (${result.durationMs}ms)`);
  },

  test: async () => {
    const forge = new GhostForge({ profile: getFlag('--profile') ?? 'default' });
    const result = await forge.test({
      matchTest:    getFlag('--match-test') ?? undefined,
      matchContract: getFlag('--match-contract') ?? undefined,
      gasReport:    hasFlag('--gas-report'),
      verbosity:    (Number(getFlag('--verbosity') ?? 2)) as 1 | 2 | 3 | 4 | 5,
    });
    console.log(`[GhostForge] Tests: ${result.passed} passed, ${result.failed} failed`);
    if (result.failed > 0) process.exit(1);
  },

  scaffold: async () => {
    const name = args[0];
    if (!name) { console.error('Usage: ghostforge scaffold <ProjectName>'); process.exit(1); }
    const forge = new GhostForge();
    await forge.scaffold(name);
  },

  networks: async () => {
    console.log('[GhostForge] Available GhostChain networks:');
    for (const [name, net] of Object.entries(GHOST_NETWORKS)) {
      console.log(`  ${name.padEnd(20)} chainId=${net.chainId}  rpc=${net.rpc}`);
    }
  },

  help: async () => {
    console.log(`
GhostForge — GhostChain Smart Contract Build Framework

Commands:
  build        Compile contracts (forge build)
  test         Run tests (forge test)
  scaffold     Scaffold a new GhostChain contract project
  networks     List available GhostChain networks

Flags:
  --profile <name>         Foundry profile (default: 'default')
  --skip-tests             Skip test files during build
  --force                  Force recompile
  --match-test <pattern>   Filter tests by name
  --match-contract <name>  Filter tests by contract
  --gas-report             Include gas report in test output
`);
  },
};

async function main() {
  const handler = COMMANDS[command ?? 'help'];
  if (!handler) {
    console.error(`[GhostForge] Unknown command: ${command}`);
    await COMMANDS.help!();
    process.exit(1);
  }
  await handler();
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function getFlag(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return null;
  return args[idx + 1] ?? null;
}

main().catch(err => { console.error('[GhostForge]', err); process.exit(1); });
