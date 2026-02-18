import path from 'node:path';
import { Interface } from 'ethers';
import { writeJson } from './manifest.js';

type TemplateField<T> = { value: T | null; resolvedFrom?: string; howToResolve?: string };

type CalldataTemplate = {
  chainId: TemplateField<string>;
  target: TemplateField<string>;
  value: string;
  signature: string;
  args: unknown[];
  calldata: string;
  notes?: string[];
};

const encode = (signature: string, args: unknown[]) => {
  const iface = new Interface([`function ${signature}`]);
  const fn = signature.split('(')[0]!;
  return iface.encodeFunctionData(fn, args as any[]);
};

export async function writeGovernanceTemplates(dir: string, opts: {
  l1ChainId?: string;
  governanceGateAddress?: string;
  federationRegistryAddress?: string;
  policyRegistryAddress?: string;
  manifestHash: string;
}) {
  const notes: string[] = [];
  const chainIdField: TemplateField<string> = opts.l1ChainId
    ? { value: opts.l1ChainId, resolvedFrom: 'env:L1_CHAIN_ID' }
    : { value: null, howToResolve: 'Set L1_CHAIN_ID (or HG_L1_CHAIN_ID) from stack env (e.g. services/stack.env or infra/opstack/.env).' };

  const govGate: TemplateField<string> = opts.governanceGateAddress
    ? { value: opts.governanceGateAddress, resolvedFrom: 'env:HG_GOVERNANCE_GATE_ADDRESS' }
    : {
        value: null,
        howToResolve:
          'Set HG_GOVERNANCE_GATE_ADDRESS to the deployed GIP governance gate contract on L1 (see contracts deployment outputs / registry).'
      };

  const federationReg: TemplateField<string> = opts.federationRegistryAddress
    ? { value: opts.federationRegistryAddress, resolvedFrom: 'env:HG_FEDERATION_REGISTRY_ADDRESS' }
    : {
        value: null,
        howToResolve:
          'Set HG_FEDERATION_REGISTRY_ADDRESS to GhostFederationRegistry on L1 (if deployed). If not deployed, this stays template-only.'
      };

  const policyReg: TemplateField<string> = opts.policyRegistryAddress
    ? { value: opts.policyRegistryAddress, resolvedFrom: 'env:POLICY_REGISTRY_ADDRESS' }
    : {
        value: null,
        howToResolve:
          'Set POLICY_REGISTRY_ADDRESS from existing stack env (e.g. infra/opstack/.env.l3 or services/stack.env) if you want policy-gated actions.'
      };

  // Template: activate GIP
  const activateSig = 'activateGIP(bytes32 activationHash)';
  const activateArgs = [`0x${opts.manifestHash}`];
  const activate: CalldataTemplate = {
    chainId: chainIdField,
    target: govGate,
    value: '0',
    signature: activateSig,
    args: activateArgs,
    calldata: encode(activateSig, activateArgs),
    notes: [
      'activationHash is the sha256(change-manifest.json) (see governance/manifest_hash.json).',
      'Target contract must enforce mainnet governance lock + timelock execution.'
    ]
  };

  // Template: toggle proof mode (future ZK evolution)
  const toggleSig = 'setProofMode(uint8 mode)';
  const toggleArgs = [0]; // 0 = OPTIMISTIC, 1 = ZK
  const toggle: CalldataTemplate = {
    chainId: chainIdField,
    target: govGate,
    value: '0',
    signature: toggleSig,
    args: toggleArgs,
    calldata: encode(toggleSig, toggleArgs),
    notes: ['Template only: wire to your on-chain gate or verifier registry when implemented.']
  };

  // Template: federation registry update (future)
  const fedSig = 'setFederatedChain(uint256 chainId,address gateway,uint8 trustModel,bool active)';
  const fedArgs = [0, '0x0000000000000000000000000000000000000000', 0, true];
  const federation: CalldataTemplate = {
    chainId: chainIdField,
    target: federationReg,
    value: '0',
    signature: fedSig,
    args: fedArgs,
    calldata: encode(fedSig, fedArgs),
    notes: ['Template only: define trustModel enum mapping in your registry implementation.']
  };

  // Template: pause domain (policy registry)
  const pauseSig = 'pauseDomain(bytes32 domain)';
  const pauseArgs = ['0x0000000000000000000000000000000000000000000000000000000000000000'];
  const pauseDomain: CalldataTemplate = {
    chainId: chainIdField,
    target: policyReg,
    value: '0',
    signature: pauseSig,
    args: pauseArgs,
    calldata: encode(pauseSig, pauseArgs),
    notes: ['Template only: requires a PolicyRegistry implementation that supports pauseDomain.']
  };

  await writeJson(path.join(dir, 'activate_gip_calldata.json'), activate);
  await writeJson(path.join(dir, 'toggle_proofmode_calldata.json'), toggle);
  await writeJson(path.join(dir, 'federation_registry_update_calldata.json'), federation);
  await writeJson(path.join(dir, 'pause_domain_calldata.json'), pauseDomain);

  if (!govGate.value) notes.push('HG_GOVERNANCE_GATE_ADDRESS not set: activate/toggle templates are unresolved targets.');
  if (!federationReg.value) notes.push('HG_FEDERATION_REGISTRY_ADDRESS not set: federation template target unresolved.');
  if (!policyReg.value) notes.push('POLICY_REGISTRY_ADDRESS not set: pause domain template target unresolved.');
  await writeJson(path.join(dir, 'unresolved_fields.json'), { notes });
}
