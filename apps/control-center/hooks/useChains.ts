"use client";
import useSWR from "swr";
import type { ChainStatus, ValidatorSummary } from "@/services/ghostchainService";
import { C3_CONFIG } from "@/config/ghostConfig";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useChains() {
  const { data, error, isLoading, mutate } = useSWR<ChainStatus[]>(
    "/api/chains/status",
    fetcher,
    { refreshInterval: C3_CONFIG.refreshIntervals.chains },
  );
  return { chains: data ?? [], isLoading, isError: !!error, refresh: mutate };
}

export function useValidators() {
  const { data, error, isLoading, mutate } = useSWR<ValidatorSummary[]>(
    "/api/chains/validators",
    fetcher,
    { refreshInterval: C3_CONFIG.refreshIntervals.validators },
  );
  return { validators: data ?? [], isLoading, isError: !!error, refresh: mutate };
}
