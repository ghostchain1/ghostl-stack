import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2] || process.env.LICENSE_REPORT || "license-report.json";
const allowlistPath = process.env.LICENSE_ALLOWLIST || path.join(process.cwd(), "scripts", "security", "license-allowlist.txt");

if (!fs.existsSync(reportPath)) {
  console.error(`license report not found: ${reportPath}`);
  process.exit(1);
}

if (!fs.existsSync(allowlistPath)) {
  console.error(`license allowlist not found: ${allowlistPath}`);
  process.exit(1);
}

const rawAllowlist = fs.readFileSync(allowlistPath, "utf8");
const allowlist = rawAllowlist
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((pattern) => new RegExp(pattern, "i"));

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const violations = [];

const toTokens = (license) => {
  const normalized = String(license)
    .replace(/[()]/g, " ")
    .replace(/\s+OR\s+/gi, "|")
    .replace(/\s+AND\s+/gi, "&")
    .replace(/\s+WITH\s+/gi, " ")
    .replace(/\//g, "|")
    .replace(/\+/g, "|")
    .trim();
  return normalized
    .split(/[|&]/)
    .map((token) => token.trim())
    .filter(Boolean);
};

const isAllowed = (token) => allowlist.some((regex) => regex.test(token));

const isLocalUnlicensed = (pkg, info) => {
  if (!pkg) return false;
  if (pkg.startsWith("ghostl-") || pkg.startsWith("ghostl-stack")) return true;
  if (info?.private === true) return true;
  return false;
};

for (const [pkg, info] of Object.entries(report)) {
  const licenseValue = info.licenses || info.license || "";
  const tokens = Array.isArray(licenseValue)
    ? licenseValue.flatMap((value) => toTokens(value))
    : toTokens(licenseValue);

  if (tokens.length === 0) {
    violations.push({ pkg, license: String(licenseValue) || "UNKNOWN" });
    continue;
  }

  const disallowed = tokens.filter((token) => {
    if (token.toUpperCase() === "UNLICENSED" && isLocalUnlicensed(pkg, info)) return false;
    return !isAllowed(token);
  });
  if (disallowed.length > 0) {
    violations.push({ pkg, license: tokens.join(" | ") });
  }
}

if (violations.length) {
  console.error("License policy violations detected:");
  for (const entry of violations) {
    console.error(`- ${entry.pkg}: ${entry.license}`);
  }
  process.exit(1);
}

console.log("License policy check passed.");
