import { Wallet, getBytes, verifyMessage } from 'ghost';

export const signParamsHash = async (paramsHash: string, privateKey: string): Promise<string> => {
  const wallet = new Wallet(privateKey);
  const bytes = getBytes(paramsHash);
  return wallet.signMessage(bytes);
};

export const recoverSigner = (paramsHash: string, signature: string): string => {
  return verifyMessage(getBytes(paramsHash), signature);
};
