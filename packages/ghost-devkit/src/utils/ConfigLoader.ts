import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface GhostConfig {
  /** Active network: l1 | l2 | l3 */
  network: "l1" | "l2" | "l3";
  /** RPC endpoints keyed by layer */
  rpc: {
    l1: string;
    l2: string;
    l3: string;
  };
  /** Deployment configuration */
  deployment: {
    confirmations: number;
    gasMultiplier: number;
  };
  /** Foundry paths */
  foundry: {
    projectRoot: string;
    outDir: string;
    scriptDir: string;
  };
  /** Validator settings */
  validator: {
    minPeers: number;
    restartOnLowPeers: boolean;
  };
  /** GhostBrain API endpoint */
  ghostbrainUrl: string;
  /** Custom fields */
  [key: string]: unknown;
}

const DEFAULTS: GhostConfig = {
  network: "l2",
  rpc: {
    l1: "http://127.0.0.1:18545",
    l2: "http://127.0.0.1:7260",
    l3: "http://127.0.0.1:7270",
  },
  deployment: {
    confirmations: 1,
    gasMultiplier: 1.2,
  },
  foundry: {
    projectRoot: "contracts",
    outDir:      "out",
    scriptDir:   "script",
  },
  validator: {
    minPeers:           3,
    restartOnLowPeers:  true,
  },
  ghostbrainUrl: "http://127.0.0.1:8080",
};

export class ConfigLoader {
  private static instance: ConfigLoader | null = null;
  private config: GhostConfig = { ...DEFAULTS };
  private loaded = false;

  private constructor(private readonly configPath: string) {}

  static getInstance(root?: string): ConfigLoader {
    const cfgPath = path.resolve(root ?? process.cwd(), "ghost.config.json");
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(cfgPath);
    }
    return ConfigLoader.instance;
  }

  /** Reset singleton (for testing) */
  static reset(): void { ConfigLoader.instance = null; }

  async load(): Promise<GhostConfig> {
    if (this.loaded) return this.config;
    try {
      await stat(this.configPath);
      const raw = await readFile(this.configPath, "utf8");
      const overrides = JSON.parse(raw) as Partial<GhostConfig>;
      this.config = this.merge(DEFAULTS, overrides);
    } catch {
      // Config file missing — use defaults silently
    }
    this.loaded = true;
    return this.config;
  }

  get<K extends keyof GhostConfig>(key: K): GhostConfig[K] {
    return this.config[key];
  }

  private merge(base: GhostConfig, override: Partial<GhostConfig>): GhostConfig {
    const out = { ...base } as Record<string, unknown>;
    for (const [k, v] of Object.entries(override)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)
          && typeof out[k] === "object" && out[k] !== null) {
        out[k] = { ...(out[k] as object), ...(v as object) };
      } else {
        out[k] = v;
      }
    }
    return out as GhostConfig;
  }

  static async loadFrom(root?: string): Promise<GhostConfig> {
    return ConfigLoader.getInstance(root).load();
  }
}
