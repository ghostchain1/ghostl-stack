import type { FeatureFlag, NetworkContext, ThemeMode } from '../../../../../packages/types';

export interface FeatureFlagsService {
  list(): Promise<FeatureFlag[]>;
  isEnabled(key: string): Promise<boolean>;
  setFlag(key: string, enabled: boolean): Promise<FeatureFlag>;
}

export interface NetworkContextService {
  getCurrent(): Promise<NetworkContext>;
  setCurrent(ctx: NetworkContext): Promise<NetworkContext>;
  listAvailable(): Promise<NetworkContext[]>;
}

export interface ThemeService {
  get(): Promise<ThemeMode>;
  set(mode: ThemeMode): Promise<void>;
}
