export type FailureClassification =
  | 'CHAIN_OK'
  | 'OUT_OF_GAS'
  | 'LOGICAL_REVERT'
  | 'TOOLING_BUG'
  | 'CHAIN_CONFIG_BUG'
  | 'RPC_NODE_BUG';

type ClassificationInput = {
  error?: string;
  trace?: unknown | null;
  receiptStatus?: number | null;
  gasUsed?: bigint | null;
  gasLimit?: bigint | null;
  estimatedGas?: bigint | null;
  txHashChanged?: boolean;
  gasLimitChanged?: boolean;
  toolingOverrideExpected?: boolean;
};

const includesAny = (message: string, terms: string[]) =>
  terms.some((term) => message.toLowerCase().includes(term));

export const classifyFailure = (input: ClassificationInput): FailureClassification => {
  if (input.receiptStatus === 1) return 'CHAIN_OK';

  const errorText = (input.error || '').toLowerCase();
  const outOfGas =
    includesAny(errorText, ['out of gas', 'intrinsic gas']) ||
    (input.gasUsed != null &&
      input.gasLimit != null &&
      input.gasUsed >= input.gasLimit * BigInt(98) / BigInt(100));

  if (outOfGas) return 'OUT_OF_GAS';

  if (includesAny(errorText, ['revert', 'invalid opcode', 'assert', 'require'])) return 'LOGICAL_REVERT';

  if (input.toolingOverrideExpected && (!input.gasLimitChanged || input.txHashChanged === false)) {
    return 'TOOLING_BUG';
  }

  if (input.trace === null) return 'RPC_NODE_BUG';

  if (input.estimatedGas != null && input.gasLimit != null && input.gasLimit > input.estimatedGas && input.receiptStatus === 0) {
    return 'CHAIN_CONFIG_BUG';
  }

  return 'RPC_NODE_BUG';
};
