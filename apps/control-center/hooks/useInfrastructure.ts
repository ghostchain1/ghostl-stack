"use client";
import useSWR from "swr";
import type { InfraSnapshot } from "@/services/infraService";
import { C3_CONFIG } from "@/config/ghostConfig";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useInfrastructure() {
  const { data, error, isLoading, mutate } = useSWR<InfraSnapshot>(
    "/api/infra/status",
    fetcher,
    { refreshInterval: C3_CONFIG.refreshIntervals.infrastructure },
  );
  return { infra: data ?? null, isLoading, isError: !!error, refresh: mutate };
}
