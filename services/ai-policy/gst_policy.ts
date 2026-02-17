export type GstPolicyContextTag = "rpc_method_only" | "ai_patch" | "ai_doc" | "pr_diff";

export type GstPolicyInput = {
  content: string;
  source?: string;
  contextTags?: GstPolicyContextTag[];
};

export type GstPolicyViolation = {
  source: string;
  line: number;
  column: number;
  token: string;
  reason: string;
};

export type GstPolicyResult = {
  ok: boolean;
  violations: GstPolicyViolation[];
};

type Rule = {
  id: string;
  pattern: RegExp;
  allowWithRpcTag?: boolean;
};

const toWord = (...codes: number[]) => String.fromCharCode(...codes);

const upperTri = toWord(69, 84, 72);
const lowerTri = toWord(101, 116, 104);
const legacyUnitWord = toWord(69, 116, 104, 101, 114);
const legacyChainWord = toWord(69, 116, 104, 101, 114, 101, 117, 109);
const legacyGlyph = toWord(926);

const upperPrefix = `${upperTri}_`;
const upperSuffix = `_${upperTri}`;
const lowerSuffix = `_${lowerTri}`;

const camelNative = `native${toWord(69, 116, 104)}`;
const camelAmount = `${lowerTri}Amount`;
const camelBalance = `${lowerTri}Balance`;
const scannerKey = `${upperTri}ERSCAN`;
const rpcPrefix = `${lowerTri}_`;
const allowedRpcMethods = new Set([`${rpcPrefix}chainId`]);

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RULES: Rule[] = [
  { id: "legacy_symbol", pattern: new RegExp(`\\b${escapeForRegex(upperTri)}\\b`, "g") },
  { id: "legacy_chain", pattern: new RegExp(`\\b${escapeForRegex(legacyChainWord)}\\b`, "gi") },
  { id: "legacy_unit", pattern: new RegExp(`\\b${escapeForRegex(legacyUnitWord)}\\b`, "g") },
  { id: "legacy_glyph", pattern: new RegExp(escapeForRegex(legacyGlyph), "g") },
  { id: "legacy_upper_prefix", pattern: new RegExp(`\\b${escapeForRegex(upperPrefix)}[A-Z0-9_]+\\b`, "g") },
  { id: "legacy_upper_suffix", pattern: new RegExp(`\\b[A-Z0-9_]+${escapeForRegex(upperSuffix)}\\b`, "g") },
  { id: "legacy_lower_suffix", pattern: new RegExp(`\\b[A-Za-z0-9_]+${escapeForRegex(lowerSuffix)}\\b`, "g") },
  { id: "legacy_lower_suffix_bare", pattern: new RegExp(`(?<![A-Za-z0-9])${escapeForRegex(lowerSuffix)}\\b`, "g") },
  { id: "legacy_camel_native", pattern: new RegExp(`\\b${escapeForRegex(camelNative)}\\b`, "g") },
  { id: "legacy_camel_amount", pattern: new RegExp(`\\b${escapeForRegex(camelAmount)}\\b`, "g") },
  { id: "legacy_camel_balance", pattern: new RegExp(`\\b${escapeForRegex(camelBalance)}\\b`, "g") },
  { id: "legacy_scanner_key", pattern: new RegExp(`\\b${escapeForRegex(scannerKey)}(?:_[A-Z0-9_]+)?\\b`, "g") },
  {
    id: "legacy_rpc_namespace",
    pattern: new RegExp(`\\b${escapeForRegex(rpcPrefix)}[a-zA-Z0-9]+\\b`, "g"),
    allowWithRpcTag: true
  }
];

export function evaluateGstPolicy(input: GstPolicyInput): GstPolicyResult {
  const source = input.source || "inline";
  const content = input.content || "";
  const tags = new Set(input.contextTags || []);
  const allowRpcTag = tags.has("rpc_method_only");

  const violations: GstPolicyViolation[] = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    for (const rule of RULES) {
      if (rule.allowWithRpcTag && allowRpcTag) continue;
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line)) !== null) {
        if (rule.id === "legacy_rpc_namespace" && allowedRpcMethods.has(match[0])) {
          continue;
        }
        violations.push({
          source,
          line: lineIndex + 1,
          column: match.index + 1,
          token: match[0],
          reason: rule.id
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function assertGstPolicy(input: GstPolicyInput): void {
  const result = evaluateGstPolicy(input);
  if (result.ok) return;
  const first = result.violations[0];
  throw new Error(`gst_policy_violation:${first.reason}:${first.source}:${first.line}:${first.column}`);
}
