export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
}

export interface NetworkContext {
  chainId: string;
  name: string;
  environment: 'local' | 'dev' | 'stage' | 'prod';
  rpcUrl?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
