/* eslint-disable no-console */
import { AbiCoder, Interface, ethers } from 'ethers';

export const CANONICAL_GHOST_TOKEN = ethers.getAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3');

export type ProposalCall = {
  target: string;
  value: bigint;
  data: string;
};

export type ExecutorMode = 'batch' | 'single' | 'v2' | 'none';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Disallow obvious legacy/native mutation paths at the selector level.
const FORBIDDEN_SIGNATURES = [
  'transferETH(address,uint256)',
  'setNativeCurrency(string,string,uint8)',
  'setGasToken(address)',
  'setGasToken(address,uint8)',
  'setNativeGasToken(address)'
] as const;

const selectorOfSig = (signature: string) => ethers.id(signature).slice(0, 10).toLowerCase();

const FORBIDDEN_SELECTORS = new Set(FORBIDDEN_SIGNATURES.map(selectorOfSig));

const normalizeAddress = (name: string, value: string) => {
  if (!ethers.isAddress(value)) {
    throw new Error(`invalid_${name}:${value}`);
  }
  const addr = ethers.getAddress(value);
  if (addr === ZERO_ADDRESS) {
    throw new Error(`zero_${name}`);
  }
  return addr;
};

const assertZeroValue = (value: bigint) => {
  if (value !== 0n) {
    throw new Error(`non_zero_value:${value.toString()}`);
  }
};

const assertCalldata = (data: string) => {
  if (!ethers.isHexString(data) || data.length < 10) {
    throw new Error('invalid_calldata');
  }
};

const assertNoForbiddenSelector = (data: string) => {
  const selector = data.slice(0, 10).toLowerCase();
  if (FORBIDDEN_SELECTORS.has(selector)) {
    throw new Error(`forbidden_selector:${selector}`);
  }
};

const GAS_TOKEN_SETTERS = new Set(['setGasToken', 'setNativeGasToken', 'setFeeToken']);

const assertCanonicalGasTokenArgs = (functionName: string, args: readonly unknown[]) => {
  if (!GAS_TOKEN_SETTERS.has(functionName)) return;
  const candidate = args[0];
  if (typeof candidate !== 'string' || !ethers.isAddress(candidate)) {
    throw new Error(`gas_token_arg_invalid:${functionName}`);
  }
  const addr = ethers.getAddress(candidate);
  if (addr !== CANONICAL_GHOST_TOKEN) {
    throw new Error(`gas_token_not_canonical:${addr}`);
  }
};

export function buildCall(target: string, abi: readonly string[], functionName: string, args: readonly unknown[]): ProposalCall {
  const normalizedTarget = normalizeAddress('target', target);
  assertCanonicalGasTokenArgs(functionName, args);

  const iface = new Interface(abi);
  const data = iface.encodeFunctionData(functionName, [...args]);

  assertCalldata(data);
  assertNoForbiddenSelector(data);

  return {
    target: normalizedTarget,
    value: 0n,
    data
  };
}

const hasFunction = (iface: Interface, signature: string) => {
  try {
    iface.getFunction(signature);
    return true;
  } catch {
    return false;
  }
};

export function buildExecutorCalldata(executorAbi: readonly string[], calls: readonly ProposalCall[], mode?: ExecutorMode) {
  if (calls.length === 0) {
    throw new Error('no_calls');
  }
  calls.forEach((call) => {
    normalizeAddress('call_target', call.target);
    assertZeroValue(call.value);
    assertCalldata(call.data);
    assertNoForbiddenSelector(call.data);
  });

  const iface = new Interface(executorAbi);
  const resolvedMode: ExecutorMode = mode ?? (hasFunction(iface, 'executeBatch(address[],uint256[],bytes[])')
    ? 'batch'
    : hasFunction(iface, 'execute(address,uint256,bytes)')
      ? 'single'
      : hasFunction(iface, 'execute(address,bytes)')
        ? 'v2'
        : 'none');

  if (resolvedMode === 'none') {
    throw new Error('executor_mode_unavailable');
  }

  if (resolvedMode === 'batch') {
    return {
      mode: resolvedMode,
      calldata: iface.encodeFunctionData('executeBatch', [
        calls.map((c) => c.target),
        calls.map((c) => c.value),
        calls.map((c) => c.data)
      ])
    } as const;
  }

  if (calls.length !== 1) {
    throw new Error(`executor_mode_requires_single_call:${resolvedMode}`);
  }

  const [call] = calls;
  if (resolvedMode === 'single') {
    return {
      mode: resolvedMode,
      // Disambiguate the overloaded execute() signatures.
      calldata: iface.encodeFunctionData('execute(address,uint256,bytes)', [call.target, call.value, call.data])
    } as const;
  }

  return {
    mode: resolvedMode,
    // Disambiguate the overloaded execute() signatures.
    calldata: iface.encodeFunctionData('execute(address,bytes)', [call.target, call.data])
  } as const;
}

export function computeProposalHash(executor: string, calldata: string, description: string) {
  const normalizedExecutor = normalizeAddress('executor', executor);
  assertCalldata(calldata);
  const coder = AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(['address', 'bytes', 'string'], [normalizedExecutor, calldata, description]));
}

export function computeGovernorHash(target: string, value: bigint, calldata: string, description: string) {
  const normalizedTarget = normalizeAddress('target', target);
  assertZeroValue(value);
  assertCalldata(calldata);
  const coder = AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(['address', 'uint256', 'bytes', 'string'], [normalizedTarget, value, calldata, description]));
}

export const EXECUTOR_ABI_FRAGMENTS = [
  'function executeBatch(address[] targets,uint256[] values,bytes[] datas) external',
  'function execute(address target,uint256 value,bytes data) external',
  'function execute(address target,bytes data) external'
] as const;
