export function normalizeContainerName(names, fallbackId = "") {
  const first = Array.isArray(names)
    ? (names.length > 0 ? names[0] : fallbackId)
    : names || fallbackId;
  return String(first).replace(/^\//, "");
}

export function pushBounded(list, value, maxEntries) {
  list.push(value);
  if (list.length > maxEntries) {
    list.splice(0, list.length - maxEntries);
  }
}

export function parseContainerStats(container, stats) {
  const memoryUsedBytes = Number(stats?.memory_stats?.usage ?? 0);
  const memoryLimitBytes = Number(stats?.memory_stats?.limit ?? 0);
  const memoryPercent = memoryLimitBytes > 0
    ? Number(((memoryUsedBytes / memoryLimitBytes) * 100).toFixed(2))
    : null;

  const cpuDelta =
    Number(stats?.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    Number(stats?.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    Number(stats?.cpu_stats?.system_cpu_usage ?? 0) -
    Number(stats?.precpu_stats?.system_cpu_usage ?? 0);
  const onlineCpus =
    Number(stats?.cpu_stats?.online_cpus ?? 0) ||
    stats?.cpu_stats?.cpu_usage?.percpu_usage?.length ||
    1;
  const cpuPercent = cpuDelta > 0 && systemDelta > 0
    ? Number((((cpuDelta / systemDelta) * onlineCpus) * 100).toFixed(2))
    : 0;

  return {
    id: container.Id,
    name: normalizeContainerName(container.Names, container.Id),
    image: container.Image,
    state: container.State,
    status: container.Status,
    memoryUsedBytes,
    memoryLimitBytes,
    memoryPercent,
    cpuPercent,
    collectedAt: new Date().toISOString()
  };
}

export function evaluateContainer(sample, config) {
  const warnBytesTriggered = config.warnBytes > 0 && sample.memoryUsedBytes >= config.warnBytes;
  const restartBytesTriggered = config.restartBytes > 0 && sample.memoryUsedBytes >= config.restartBytes;
  const warnPercentTriggered =
    sample.memoryPercent !== null && sample.memoryPercent >= config.warnPercent;
  const restartPercentTriggered =
    sample.memoryPercent !== null && sample.memoryPercent >= config.restartPercent;

  if (restartBytesTriggered || restartPercentTriggered) {
    return {
      state: "critical",
      action: "restart",
      reason: restartBytesTriggered
        ? `memory_bytes_${sample.memoryUsedBytes}`
        : `memory_percent_${sample.memoryPercent}`
    };
  }
  if (warnBytesTriggered || warnPercentTriggered) {
    return {
      state: "warning",
      action: "observe",
      reason: warnBytesTriggered
        ? `memory_bytes_${sample.memoryUsedBytes}`
        : `memory_percent_${sample.memoryPercent}`
    };
  }
  return {
    state: "ok",
    action: "none",
    reason: "within_threshold"
  };
}

export function canRestart(record, now, config) {
  const restartHistory = (record.restartHistory ?? []).filter(
    (timestamp) => now - timestamp < 60 * 60 * 1000
  );
  if (restartHistory.length >= config.maxRestartsPerHour) {
    return false;
  }
  if (record.lastRestartAt && now - record.lastRestartAt < config.restartCooldownMs) {
    return false;
  }
  return true;
}
