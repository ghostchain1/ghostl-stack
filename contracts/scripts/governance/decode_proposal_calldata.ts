/* eslint-disable no-console */
import { Interface, ghost } from 'ghost';
import { EXECUTOR_ABI_FRAGMENTS, computeGovernorHash, computeProposalHash } from './build_proposal_calldata';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const slashingAbi = [
  'function setFeePolicy((uint256 maxBaseFeeGHOST,uint256 maxPriorityFeeGHOST,uint256 spikeThresholdBps,uint256 windowSeconds,uint256 violationPenaltyBps,uint256 minBondGHOST) policy) external',
  'function setWatcherRoles(address watcher,bool allowed) external',
  'function enableAutoExec(bool enabled) external',
  'function setStakingManager(address staking) external'
] as const;

const stakingAbi = [
  'function setSlashManager(address manager) external'
] as const;

const governedAbi = [
  'function setGovernance(address governor,address timelock) external'
] as const;

type KnownDecoder = {
  label: string;
  iface: Interface;
};

const knownDecoders: KnownDecoder[] = [
  { label: 'SlashingManager', iface: new Interface(slashingAbi) },
  { label: 'StakingManager', iface: new Interface(stakingAbi) },
  { label: 'Governed', iface: new Interface(governedAbi) }
];

const executorIface = new Interface(EXECUTOR_ABI_FRAGMENTS);

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  const addr = ghost.getAddress(value);
  if (addr === ZERO_ADDRESS) {
    throw new Error(`zero_${name}`);
  }
  return addr;
}

function requireCalldata(name: string, value: string | undefined) {
  if (!value || !ghost.isHexString(value) || value.length < 10) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return value;
}

function tryParse(iface: Interface, data: string) {
  try {
    return iface.parseTransaction({ data });
  } catch {
    return null;
  }
}

function formatArg(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((v) => formatArg(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = formatArg(v);
    }
    return out;
  }
  return value;
}

const jsonReplacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

function decodeKnownTarget(target: string, data: string) {
  for (const decoder of knownDecoders) {
    const parsed = tryParse(decoder.iface, data);
    if (!parsed) continue;
    const args = parsed.args ? formatArg(parsed.args.toObject()) : {};
    return {
      kind: 'target' as const,
      target,
      decoder: decoder.label,
      functionName: parsed.name,
      signature: parsed.signature,
      selector: parsed.selector,
      args
    };
  }
  return {
    kind: 'target' as const,
    target,
    decoder: 'unknown',
    functionName: 'unknown',
    signature: 'unknown',
    selector: data.slice(0, 10),
    args: {}
  };
}

function decodeExecutorPayload(target: string, data: string) {
  const parsed = tryParse(executorIface, data);
  if (!parsed) return null;

  if (parsed.name === 'executeBatch') {
    const targets = parsed.args?.[0] as string[];
    const values = parsed.args?.[1] as bigint[];
    const datas = parsed.args?.[2] as string[];
    const calls = targets.map((t, i) => ({
      target: ghost.getAddress(t),
      value: values[i] ?? 0n,
      data: datas[i] ?? '0x'
    }));
    const decoded = calls.map((call) => ({
      ...call,
      decoded: decodeKnownTarget(call.target, call.data)
    }));
    return {
      kind: 'executor' as const,
      executor: target,
      mode: 'batch' as const,
      selector: parsed.selector,
      signature: parsed.signature,
      calls: decoded
    };
  }

  if (parsed.name === 'execute') {
    // This may be either execute(address,uint256,bytes) or execute(address,bytes).
    const argc = parsed.args?.length ?? 0;

    if (argc === 3) {
      const call = {
        target: ghost.getAddress(parsed.args?.[0] as string),
        value: parsed.args?.[1] as bigint,
        data: String(parsed.args?.[2] ?? '0x')
      };
      return {
        kind: 'executor' as const,
        executor: target,
        mode: 'single' as const,
        selector: parsed.selector,
        signature: parsed.signature,
        calls: [
          {
            ...call,
            decoded: decodeKnownTarget(call.target, call.data)
          }
        ]
      };
    }

    if (argc === 2) {
      const call = {
        target: ghost.getAddress(parsed.args?.[0] as string),
        value: 0n,
        data: String(parsed.args?.[1] ?? '0x')
      };
      return {
        kind: 'executor' as const,
        executor: target,
        mode: 'v2' as const,
        selector: parsed.selector,
        signature: parsed.signature,
        calls: [
          {
            ...call,
            decoded: decodeKnownTarget(call.target, call.data)
          }
        ]
      };
    }

    return {
      kind: 'executor' as const,
      executor: target,
      mode: 'unknown' as const,
      selector: parsed.selector,
      signature: parsed.signature,
      calls: []
    };
  }

  return null;
}

async function main() {
  const target = requireAddress('PROPOSAL_TARGET_ADDRESS', process.env.PROPOSAL_TARGET_ADDRESS);
  const calldata = requireCalldata('PROPOSAL_CALLDATA', process.env.PROPOSAL_CALLDATA);
  const description = process.env.PROPOSAL_DESCRIPTION ?? 'Decode proposal calldata';
  const executorAddress = process.env.PROPOSAL_EXECUTOR_ADDRESS;

  const executorDecoded = decodeExecutorPayload(target, calldata);
  const decoded = executorDecoded ?? decodeKnownTarget(target, calldata);

  console.log('[decode] target:', target);
  console.log('[decode] selector:', calldata.slice(0, 10));
  console.log('[decode] description:', description);
  console.log('[decode] decoded:', JSON.stringify(decoded, jsonReplacer, 2));

  // Always show the governor hash for the direct target + calldata.
  try {
    const governorHash = computeGovernorHash(target, 0n, calldata, description);
    console.log('[decode] governorHash:', governorHash);
  } catch (err) {
    console.warn('[decode] governorHash error:', (err as Error).message);
  }

  // If the caller provides an executor address, compute a proposal hash too.
  if (executorAddress && ghost.isAddress(executorAddress)) {
    try {
      const executor = ghost.getAddress(executorAddress);
      const proposalHash = computeProposalHash(executor, calldata, description);
      console.log('[decode] proposalHash:', proposalHash);
    } catch (err) {
      console.warn('[decode] proposalHash error:', (err as Error).message);
    }
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
