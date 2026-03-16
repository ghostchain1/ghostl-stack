// GhostLint — GhostChain 15-Layer Branding Enforcement Scanner
// Blocks any reference to banned Ethereum ecosystem terms in application code.
// Run as CI gate: `ghostlint scan .` must exit 0 before any merge.

import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// ─── Branding Rules (15 layers) ───────────────────────────────────────────────

export interface GhostLintRule {
  id: string;
  description: string;
  pattern: RegExp;
  severity: 'error' | 'warning';
  /** Suggested GhostChain replacement */
  suggestion: string;
  /** Applies only to these file extensions */
  fileTypes: string[];
}

export const GHOST_LINT_RULES: GhostLintRule[] = [
  {
    id: 'GHOST-001',
    description: 'Native token must be GST, not ETH/Ether/WETH',
    pattern: /\b(ETH|Ether|WETH|ether)\b(?!\w)/g,
    severity: 'error',
    suggestion: 'GST',
    fileTypes: ['.ts', '.js', '.sol', '.json', '.md'],
  },
  {
    id: 'GHOST-002',
    description: 'Chain name must be GhostChain, not Ethereum/Mainnet',
    pattern: /\b(Ethereum|Mainnet|ethereum mainnet)\b/gi,
    severity: 'error',
    suggestion: 'GhostChain',
    fileTypes: ['.ts', '.js', '.sol', '.json', '.md', '.yml', '.yaml'],
  },
  {
    id: 'GHOST-003',
    description: 'RPC namespace must be ghost_, not eth_',
    pattern: /\beth_[a-zA-Z]/g,
    severity: 'error',
    suggestion: 'ghost_',
    fileTypes: ['.ts', '.js', '.json'],
  },
  {
    id: 'GHOST-004',
    description: 'Use ghost-sdk or ghost-sdk-core, not ethers.js directly',
    pattern: /from ['"]ethers['"]|require\(['"]ethers['"]\)/g,
    severity: 'error',
    suggestion: "import from '@ghostchain/ghost-sdk'",
    fileTypes: ['.ts', '.js'],
  },
  {
    id: 'GHOST-005',
    description: 'Do not use web3.js directly',
    pattern: /from ['"]web3['"]|require\(['"]web3['"]\)/g,
    severity: 'error',
    suggestion: "import from '@ghostchain/ghost-sdk-core'",
    fileTypes: ['.ts', '.js'],
  },
  {
    id: 'GHOST-006',
    description: 'Explorer must be GhostScan, not Etherscan',
    pattern: /\bEtherscan\b/gi,
    severity: 'error',
    suggestion: 'GhostScan',
    fileTypes: ['.ts', '.js', '.md', '.json', '.yml'],
  },
  {
    id: 'GHOST-007',
    description: 'Wallet must be GhostWallet, not MetaMask',
    pattern: /\bMetaMask\b/gi,
    severity: 'error',
    suggestion: 'GhostWallet',
    fileTypes: ['.ts', '.js', '.md'],
  },
  {
    id: 'GHOST-008',
    description: 'DNS must be GNS, not ENS',
    pattern: /\b(ENS|ens\.domains)\b/gi,
    severity: 'error',
    suggestion: 'GNS',
    fileTypes: ['.ts', '.js', '.sol', '.md'],
  },
  {
    id: 'GHOST-009',
    description: 'DEX must be GhostXchange, not Uniswap/SushiSwap',
    pattern: /\b(Uniswap|SushiSwap|uniswap|sushiswap)\b/gi,
    severity: 'error',
    suggestion: 'GhostXchange',
    fileTypes: ['.ts', '.js', '.sol', '.md'],
  },
  {
    id: 'GHOST-010',
    description: 'AI engine must be GhostBrain, not OpenAI/ChatGPT',
    pattern: /\b(OpenAI|ChatGPT|openai\.com)\b/gi,
    severity: 'warning',
    suggestion: 'GhostBrain',
    fileTypes: ['.ts', '.js', '.md'],
  },
  {
    id: 'GHOST-011',
    description: 'Package scope must be @ghostchain/*, not @ethereum/*/@openzeppelin/* in app code',
    pattern: /@(ethereum|openzeppelin)\//g,
    severity: 'warning',
    suggestion: '@ghostchain/',
    fileTypes: ['.ts', '.js'],
  },
  {
    id: 'GHOST-012',
    description: 'Token standard must be GRC, not ERC',
    pattern: /\bERC-?\d+\b/gi,
    severity: 'error',
    suggestion: 'GRC (e.g. GRC-721, GRC-1155)',
    fileTypes: ['.ts', '.js', '.md', '.sol'],
  },
  {
    id: 'GHOST-013',
    description: 'VM must be GVM, not EVM',
    pattern: /\bEVM\b/g,
    severity: 'error',
    suggestion: 'GVM',
    fileTypes: ['.ts', '.js', '.md', '.sol'],
  },
  {
    id: 'GHOST-014',
    description: 'Do not reference Arbitrum or Base (external chains)',
    pattern: /\b(Arbitrum|arbitrum|Base (?:chain|network))\b/gi,
    severity: 'error',
    suggestion: 'GhostL2 or GhostL3',
    fileTypes: ['.ts', '.js', '.sol', '.md', '.json'],
  },
  {
    id: 'GHOST-015',
    description: 'Contract library header must be GhostChain Contracts, not OpenZeppelin Contracts',
    pattern: /\/\/ OpenZeppelin Contracts/g,
    severity: 'warning',
    suggestion: '// GhostChain Contracts v5.6.1',
    fileTypes: ['.sol'],
  },
];

// ─── Ignored paths ────────────────────────────────────────────────────────────

const IGNORED_DIRS = [
  'node_modules',
  'dist',
  'out',
  'contracts/lib',
  'contracts/test/constitutional',
  '.git',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GhostLintViolation {
  ruleId: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column: number;
  matched: string;
  suggestion: string;
  description: string;
}

export interface GhostLintReport {
  scannedFiles: number;
  errors: number;
  warnings: number;
  violations: GhostLintViolation[];
  passed: boolean;
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

/**
 * GhostLint — branding enforcement scanner.
 *
 * @example
 * ```ts
 * import { GhostLint } from '@ghostchain/ghostlint';
 *
 * const lint = new GhostLint();
 * const report = await lint.scan('./src');
 * if (!report.passed) process.exit(1);
 * ```
 */
export class GhostLint {
  private readonly rules: GhostLintRule[];
  private readonly fix: boolean;

  constructor(opts: { rules?: GhostLintRule[]; fix?: boolean } = {}) {
    this.rules = opts.rules ?? GHOST_LINT_RULES;
    this.fix   = opts.fix ?? false;
  }

  /** Scan a directory for branding violations */
  async scan(dir: string): Promise<GhostLintReport> {
    const root = resolve(dir);
    const allFiles = await this._collectFiles(root);
    const violations: GhostLintViolation[] = [];

    for (const filePath of allFiles) {
      const ext = '.' + filePath.split('.').pop();
      const applicableRules = this.rules.filter(r => r.fileTypes.includes(ext));
      if (!applicableRules.length) continue;

      const content = await readFile(filePath, 'utf-8').catch(() => '');
      const lines   = content.split('\n');

      for (const rule of applicableRules) {
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx]!;
          rule.pattern.lastIndex = 0;

          let match: RegExpExecArray | null;
          while ((match = rule.pattern.exec(line)) !== null) {
            violations.push({
              ruleId:      rule.id,
              severity:    rule.severity,
              file:        relative(root, filePath),
              line:        lineIdx + 1,
              column:      match.index + 1,
              matched:     match[0],
              suggestion:  rule.suggestion,
              description: rule.description,
            });
          }
        }
      }
    }

    const errors   = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warning').length;

    return {
      scannedFiles: allFiles.length,
      errors,
      warnings,
      violations,
      passed: errors === 0,
    };
  }

  /** Scan a single file */
  async scanFile(filePath: string): Promise<GhostLintViolation[]> {
    const report = await this.scan(filePath);
    return report.violations;
  }

  /** Format report for console output */
  static formatReport(report: GhostLintReport): string {
    const lines: string[] = [];
    lines.push(`\n[GhostLint] Scanned ${report.scannedFiles} files`);
    lines.push(`  Errors:   ${report.errors}`);
    lines.push(`  Warnings: ${report.warnings}`);
    lines.push('');

    for (const v of report.violations) {
      const icon = v.severity === 'error' ? '✗' : '⚠';
      lines.push(`  ${icon} ${v.file}:${v.line}:${v.column}  [${v.ruleId}] ${v.description}`);
      lines.push(`    Found:    '${v.matched}'`);
      lines.push(`    Replace:  '${v.suggestion}'`);
    }

    lines.push('');
    lines.push(report.passed ? '[GhostLint] PASSED — no branding errors' : '[GhostLint] FAILED — fix branding errors');
    return lines.join('\n');
  }

  private async _collectFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (current: string) => {
      const { readdir, stat } = await import('node:fs/promises');
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = resolve(current, entry.name);

        if (IGNORED_DIRS.some(ignored => full.includes(ignored))) continue;

        if (entry.isDirectory()) {
          await walk(full);
        } else {
          files.push(full);
        }
      }
    };

    // If dir is a file, scan just that file
    const s = await import('node:fs/promises').then(m => m.stat(dir));
    if (s.isFile()) {
      files.push(dir);
    } else {
      await walk(dir);
    }

    return files;
  }
}

export default GhostLint;
