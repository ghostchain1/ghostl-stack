import { parse } from 'yaml';
import { PolicyBundleSchema } from './dsl-schema';
import type { PolicyBundle } from './types';

export function parsePolicyBundle(yamlText: string): PolicyBundle {
  const raw = parse(yamlText);
  const result = PolicyBundleSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`policy_bundle_invalid: ${result.error.message}`);
  }

  return result.data;
}
