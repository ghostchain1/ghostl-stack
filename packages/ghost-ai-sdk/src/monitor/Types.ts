export type ValidatorHealth = {
  id:           string;
  ok:           boolean;
  chainId?:     number;
  blockNumber?: number;
  latencyMs?:   number;
  error?:       string;
};
