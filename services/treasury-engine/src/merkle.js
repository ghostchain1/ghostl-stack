import crypto from "node:crypto";

export function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  return JSON.stringify(value);
}

export function hashLeaf(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function buildMerkleRoot(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { root: null, leaves: [] };
  }

  const leaves = values.map((value) => hashLeaf(value));
  let level = [...leaves];

  while (level.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      const combined = crypto.createHash("sha256").update(`${left}${right}`).digest("hex");
      nextLevel.push(combined);
    }
    level = nextLevel;
  }

  return {
    root: level[0],
    leaves
  };
}
