import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import {
  decryptSecret,
  encryptSecret,
  generateMnemonicWallet,
  loadMasterKey,
  walletFromMnemonic,
  walletFromPrivateKey
} from '@ghostl/ghostwallet';
import type { WalletService } from './wallet-store';
import type { WalletRecord } from '@ghostl/types';
import { env } from '../config/env';

type ChainRef = 'l1' | 'l2' | 'l3';

type WalletCreateInput = {
  userId: string;
  label: string;
  chainId?: ChainRef;
  derivationPath?: string;
};

type WalletImportInput = {
  userId: string;
  label: string;
  chainId?: ChainRef;
  mnemonic?: string;
  privateKey?: string;
  derivationPath?: string;
};

type SendTxInput = {
  walletId: string;
  chainId: ChainRef;
  to: string;
  amount: string;
  token?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  data?: string;
};

type SignTxInput = {
  walletId: string;
  chainId: ChainRef;
  to?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
};

type FundWalletInput = {
  walletId: string;
  amount: string;
  chainId?: ChainRef;
  data?: string;
};

type ReceiptSummary = {
  status: 'pending' | 'confirmed';
  tx: string;
  chainId: ChainRef;
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string | null;
  from?: string;
  to?: string | null;
};

const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];

const rpcFor = (chainId: ChainRef) => {
  if (chainId === 'l1') return env.RPC_L1 || env.EXPLORER_RPC_URL || 'http://localhost:18545';
  if (chainId === 'l3') return env.RPC_L3 || env.EXPLORER_RPC_URL || 'http://localhost:39545';
  return env.RPC_L2 || env.EXPLORER_RPC_URL || 'http://localhost:18547';
};

const keyPreview = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const createGhostWalletService = (wallets: WalletService) => {
  const masterKey = loadMasterKey(env.GHOSTWALLET_MASTER_KEY);
  const defaultPath = env.GHOSTWALLET_DERIVATION_PATH || "m/44'/60'/0'/0/0";

  const decryptKey = (wallet: WalletRecord) => {
    if (!wallet.encryptedKey) {
      throw new Error('wallet_missing_key');
    }
    return decryptSecret(wallet.encryptedKey, masterKey);
  };

  const createCustodialRecord = async (
    input: WalletCreateInput,
    material: { address: string; privateKey: string; mnemonic?: string; derivationPath?: string; keyType?: WalletRecord['keyType'] }
  ) => {
    const encryptedKey = encryptSecret(material.privateKey, masterKey);
    const encryptedMnemonic = material.mnemonic ? encryptSecret(material.mnemonic, masterKey) : undefined;
    return wallets.createCustodial({
      label: input.label,
      chainId: input.chainId || 'l1',
      ownerUserId: input.userId,
      address: material.address,
      encryptedKey,
      encryptedMnemonic,
      derivationPath: material.derivationPath,
      keyType: material.keyType,
      keyPreview: keyPreview(material.address)
    });
  };

  return {
    async createWallet(input: WalletCreateInput) {
      const derived = generateMnemonicWallet(input.derivationPath || defaultPath);
      return createCustodialRecord(input, {
        ...derived,
        keyType: 'mnemonic'
      });
    },
    async importWallet(input: WalletImportInput) {
      if (!input.mnemonic && !input.privateKey) {
        throw new Error('mnemonic_or_private_key_required');
      }
      const material = input.mnemonic
        ? walletFromMnemonic(input.mnemonic, input.derivationPath || defaultPath)
        : walletFromPrivateKey(input.privateKey as string);
      return createCustodialRecord(
        { userId: input.userId, label: input.label, chainId: input.chainId },
        {
          ...material,
          keyType: input.mnemonic ? 'mnemonic' : 'privateKey'
        }
      );
    },
    async rotateWallet(walletId: string, derivationPath?: string) {
      const derived = generateMnemonicWallet(derivationPath || defaultPath);
      const encryptedKey = encryptSecret(derived.privateKey, masterKey);
      const encryptedMnemonic = derived.mnemonic ? encryptSecret(derived.mnemonic, masterKey) : undefined;
      return wallets.rotateCustodialKey(walletId, {
        address: derived.address,
        encryptedKey,
        encryptedMnemonic,
        derivationPath: derived.derivationPath,
        keyType: 'mnemonic',
        keyPreview: keyPreview(derived.address)
      });
    },
    async signMessage(walletId: string, message: string) {
      const wallet = await wallets.get(walletId);
      if (!wallet) throw new Error('wallet_not_found');
      const pk = decryptKey(wallet);
      const signer = new Wallet(pk);
      return signer.signMessage(message);
    },
    async signTransaction(input: SignTxInput) {
      const wallet = await wallets.get(input.walletId);
      if (!wallet) throw new Error('wallet_not_found');
      const pk = decryptKey(wallet);
      const provider = new JsonRpcProvider(rpcFor(input.chainId));
      const signer = new Wallet(pk, provider);
      const network = await provider.getNetwork();
      const signed = await signer.signTransaction({
        to: input.to,
        value: input.value,
        data: input.data,
        gasLimit: input.gasLimit,
        gasPrice: input.gasPrice,
        maxFeePerGas: input.maxFeePerGas,
        maxPriorityFeePerGas: input.maxPriorityFeePerGas,
        nonce: input.nonce,
        chainId: Number(network.chainId)
      });
      return { signed };
    },
    async sendTransaction(input: SendTxInput) {
      const wallet = await wallets.get(input.walletId);
      if (!wallet) throw new Error('wallet_not_found');
      const pk = decryptKey(wallet);
      const provider = new JsonRpcProvider(rpcFor(input.chainId));
      const signer = new Wallet(pk, provider);
      let tx;
      if (input.token) {
        const contract = new Contract(input.token, erc20Abi, signer);
        tx = await contract.transfer(input.to, input.amount, {
          gasLimit: input.gasLimit,
          gasPrice: input.gasPrice,
          maxFeePerGas: input.maxFeePerGas,
          maxPriorityFeePerGas: input.maxPriorityFeePerGas
        });
      } else {
        tx = await signer.sendTransaction({
          to: input.to,
          value: input.amount,
          gasLimit: input.gasLimit,
          gasPrice: input.gasPrice,
          maxFeePerGas: input.maxFeePerGas,
          maxPriorityFeePerGas: input.maxPriorityFeePerGas,
          data: input.data
        });
      }
      await tx.wait();
      return { tx: tx.hash };
    },
    async fundWallet(input: FundWalletInput) {
      const wallet = await wallets.get(input.walletId);
      if (!wallet) throw new Error('wallet_not_found');
      const funderKey = env.GHOSTWALLET_FUNDER_PRIVATE_KEY;
      if (!funderKey) {
        throw new Error('funder_not_configured');
      }
      const chainId = input.chainId || env.GHOSTWALLET_FUNDER_CHAIN || 'l1';
      const provider = new JsonRpcProvider(rpcFor(chainId));
      const funder = new Wallet(funderKey, provider);
      const tx = await funder.sendTransaction({
        to: wallet.address,
        value: input.amount,
        data: input.data
      });
      await tx.wait();
      return { tx: tx.hash, from: funder.address, to: wallet.address, chainId };
    },
    async getTransactionReceipt(chainId: ChainRef, txHash: string): Promise<ReceiptSummary> {
      const provider = new JsonRpcProvider(rpcFor(chainId));
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return { status: 'pending', tx: txHash, chainId };
      }
      return {
        status: 'confirmed',
        tx: receipt.hash,
        chainId,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        effectiveGasPrice: (receipt as { effectiveGasPrice?: bigint }).effectiveGasPrice?.toString() ?? null,
        from: receipt.from,
        to: receipt.to
      };
    }
  };
};

export type GhostWalletService = ReturnType<typeof createGhostWalletService>;
