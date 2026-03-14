/**
 * GhostSigner — abstract signing interface for Ghost-native operations.
 */
import { GhostProvider } from "./GhostProvider";
import { GhostTransaction } from "./GhostTransaction";

export interface GhostSigner {
  getAddress(): Promise<string>;
  sign(tx: Partial<GhostTransaction>): Promise<string>;
  provider: GhostProvider;
}
