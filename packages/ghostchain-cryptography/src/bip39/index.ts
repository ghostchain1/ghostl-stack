/**
 * @module @ghostchain/ghostchain-cryptography/bip39/index
 *
 * BIP-39 mnemonic generation and seed derivation.
 * Drop-in replacement for ethereum-cryptography/bip39.
 * Backed by @scure/bip39.
 */
export {
  generateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicToSeedSync,
} from "@scure/bip39";
