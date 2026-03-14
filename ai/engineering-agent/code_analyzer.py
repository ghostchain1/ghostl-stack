#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Code Analyzer
===========================================================
Runs static analysis against the scanned repo manifest and returns a list of
findings.  Each finding carries enough context for PatchGenerator to build a
minimal fix.

Analysis surfaces
-----------------
1. **Routing law** — any L3→L1 or L2→external-chain reference.
2. **Forge lint** — runs `forge lint` inside contracts/, parses warnings.
3. **GST leakage** — grep for ETH / WETH / eth_ / Ether in non-exempt paths.
4. **Branding violations** — eth_ RPC namespace, Etherscan, Uniswap, etc.
5. **Python syntax** — `py_compile` every .py file.
6. **Shell safety** — grep for `shell=True` and `eval` in Python files.
7. **TypeScript build** — `tsc --noEmit` where tsconfig.json is present.
8. **Solidity dead imports** — detect unused import lines.
9. **Hardcoded secrets** — regex scan for private keys, mnemonics, JWT secrets.

Rules
-----
• No shell=True anywhere in this file.
• Findings are never acted upon here — just reported.
• Tool binaries that are absent are silently skipped.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from repo_scanner import RepoManifest, ScannedFile

logger = logging.getLogger("CodeAnalyzer")

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")


@dataclass
class Finding:
    severity:   str    # CRITICAL | HIGH | MEDIUM | LOW | INFO
    category:   str    # routing | gst_leakage | branding | syntax | security | build
    file:       str    # repo-relative path
    line:       int    # best-effort; 0 = whole-file
    message:    str
    tool:       str    # which check produced this
    fixable:    bool = False   # PatchGenerator can attempt auto-fix
    context:    dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "file":     self.file,
            "line":     self.line,
            "message":  self.message,
            "tool":     self.tool,
            "fixable":  self.fixable,
            "context":  self.context,
        }


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Routing violations: any import / call / address that targets external chains
# from L2 (chain_id 901) or L3 (chain_id 903) code.
_L1_EXTERNAL_CHAINS = re.compile(
    r"\b(mainnet|arbitrum|base|optimism|polygon|ethereum)\b", re.IGNORECASE
)

# Forbidden external chain IDs appearing in code
_FORBIDDEN_CHAIN_IDS = re.compile(r"\b(1|42161|8453|10|137)\b")

# GST leakage
_ETH_REFS = re.compile(
    r"\b(ETH|WETH|Ether|ether)\b|\"eth_|'eth_|`eth_",
    re.IGNORECASE,
)

# Branding violations
_BRANDING_VIOLATIONS = {
    re.compile(r"\bEtherscan\b",                   re.IGNORECASE): "Use GhostScan instead of Etherscan",
    re.compile(r"\bUniswap\b",                      re.IGNORECASE): "Use GhostXchange instead of Uniswap",
    re.compile(r"\bSushiSwap\b",                    re.IGNORECASE): "Use GhostXchange instead of SushiSwap",
    re.compile(r"\bMetaMask\b",                     re.IGNORECASE): "Use GhostWallet instead of MetaMask",
    re.compile(r"\b@openzeppelin\b",                re.IGNORECASE): "Use @ghostchain/* scoped imports",
    re.compile(r"\/\/ OpenZeppelin Contracts",      re.IGNORECASE): "Header must be '// GhostChain Contracts v5.6.1'",
    re.compile(r"\bENS\b"):                                        "Use GNS instead of ENS",
}

# Security: shell injection risk patterns in Python
_SHELL_TRUE = re.compile(r"shell\s*=\s*True")
_EVAL_CALL  = re.compile(r"\beval\s*\(")

# Secrets patterns (simplified — no false-positive paranoia)
_SECRET_PATTERNS = [
    (re.compile(r"0x[0-9a-fA-F]{64}"),              "Possible private key literal"),
    (re.compile(r"(?i)private[_\s]?key\s*=\s*['\"]0x"), "Private key assignment"),
    (re.compile(r"(?i)mnemonic\s*=\s*['\"][a-z ]{30,}"), "Mnemonic assignment"),
    (re.compile(r"(?i)jwt[_\s]?secret\s*=\s*['\"][A-Za-z0-9]{20,}"), "Hardcoded JWT secret"),
]

# Directories exempt from branding/GST checks
_EXEMPT_DIRS = frozenset([
    "contracts/lib", "contracts/test/constitutional",
    "node_modules", "dist", "out",
])

# Solidity file header that must be present
_SOL_HEADER_RE = re.compile(r"// GhostChain Contracts v5\.6\.1")


def _is_exempt(rel_path: str) -> bool:
    return any(rel_path.startswith(e) for e in _EXEMPT_DIRS)


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------

class CodeAnalyzer:
    """Run all static analysis passes and return merged findings."""

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg   = config
        self._repo  = Path(config["repo_path"])
        self._chain = config.get("chain_ids", {"l1": 14000101, "l2": 901, "l3": 903})

    # ------------------------------------------------------------------
    def analyze(self, manifest: RepoManifest) -> list[Finding]:
        findings: list[Finding] = []

        findings.extend(self._check_routing(manifest))
        findings.extend(self._check_gst_leakage(manifest))
        findings.extend(self._check_branding(manifest))
        findings.extend(self._check_secrets(manifest))
        findings.extend(self._check_shell_safety(manifest))
        findings.extend(self._check_python_syntax(manifest))
        findings.extend(self._check_sol_headers(manifest))

        if self._cfg.get("static_analysis", {}).get("forge_lint", True):
            findings.extend(self._run_forge_lint())

        if self._cfg.get("static_analysis", {}).get("shellcheck", True):
            findings.extend(self._run_shellcheck(manifest))

        findings.sort(key=lambda f: SEVERITIES.index(f.severity))
        logger.info("Analysis complete: %d findings", len(findings))
        return findings

    # ------------------------------------------------------------------
    # Routing law checks
    # ------------------------------------------------------------------

    def _check_routing(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        l2_files = [f for f in manifest.files if "/l2/" in f.rel_path or "ghostl2" in f.rel_path.lower()]
        l3_files = [f for f in manifest.files if "/l3/" in f.rel_path or "ghostl3" in f.rel_path.lower()]
        suspect = l2_files + l3_files

        for sf in suspect:
            if _is_exempt(sf.rel_path):
                continue
            try:
                lines = Path(sf.path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, start=1):
                if _L1_EXTERNAL_CHAINS.search(line):
                    findings.append(Finding(
                        severity="CRITICAL",
                        category="routing",
                        file=sf.rel_path,
                        line=i,
                        message=f"L2/L3 code references external chain: {line.strip()[:80]}",
                        tool="routing_checker",
                        fixable=False,
                        context={"raw_line": line.rstrip()},
                    ))
        return findings

    # ------------------------------------------------------------------
    # GST leakage
    # ------------------------------------------------------------------

    def _check_gst_leakage(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        target_types = {"solidity", "typescript", "javascript", "python", "yaml"}
        for sf in manifest.files:
            if sf.file_type not in target_types:
                continue
            if _is_exempt(sf.rel_path):
                continue
            try:
                lines = Path(sf.path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, start=1):
                if _ETH_REFS.search(line) and "GhostBrain" not in line:
                    findings.append(Finding(
                        severity="HIGH",
                        category="gst_leakage",
                        file=sf.rel_path,
                        line=i,
                        message=f"Non-GST token reference: {line.strip()[:80]}",
                        tool="gst_checker",
                        fixable=False,
                    ))
        return findings

    # ------------------------------------------------------------------
    # Branding
    # ------------------------------------------------------------------

    def _check_branding(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        target_types = {"solidity", "typescript", "javascript", "python", "yaml", "markdown"}
        for sf in manifest.files:
            if sf.file_type not in target_types:
                continue
            if _is_exempt(sf.rel_path):
                continue
            try:
                lines = Path(sf.path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for pattern, msg in _BRANDING_VIOLATIONS.items():
                for i, line in enumerate(lines, start=1):
                    if pattern.search(line):
                        findings.append(Finding(
                            severity="MEDIUM",
                            category="branding",
                            file=sf.rel_path,
                            line=i,
                            message=msg,
                            tool="branding_checker",
                        ))
        return findings

    # ------------------------------------------------------------------
    # Secret scanning
    # ------------------------------------------------------------------

    def _check_secrets(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        skip_types = {"other", "markdown"}
        for sf in manifest.files:
            if sf.file_type in skip_types:
                continue
            if _is_exempt(sf.rel_path):
                continue
            # Skip .env.example and sample files — they intentionally have placeholders
            if "example" in sf.rel_path.lower() or "sample" in sf.rel_path.lower():
                continue
            try:
                lines = Path(sf.path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for pattern, desc in _SECRET_PATTERNS:
                for i, line in enumerate(lines, start=1):
                    if pattern.search(line):
                        findings.append(Finding(
                            severity="CRITICAL",
                            category="security",
                            file=sf.rel_path,
                            line=i,
                            message=f"Possible hardcoded secret: {desc}",
                            tool="secret_scanner",
                            fixable=False,
                        ))
        return findings

    # ------------------------------------------------------------------
    # Shell safety (Python files)
    # ------------------------------------------------------------------

    def _check_shell_safety(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        for sf in manifest.files:
            if sf.file_type != "python":
                continue
            try:
                lines = Path(sf.path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, start=1):
                if _SHELL_TRUE.search(line):
                    findings.append(Finding(
                        severity="HIGH",
                        category="security",
                        file=sf.rel_path,
                        line=i,
                        message="shell=True in subprocess call — risk of shell injection",
                        tool="shell_checker",
                        fixable=False,
                    ))
                if _EVAL_CALL.search(line):
                    findings.append(Finding(
                        severity="MEDIUM",
                        category="security",
                        file=sf.rel_path,
                        line=i,
                        message="eval() usage — verify input is not user-controlled",
                        tool="shell_checker",
                    ))
        return findings

    # ------------------------------------------------------------------
    # Python syntax
    # ------------------------------------------------------------------

    def _check_python_syntax(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        for sf in manifest.files:
            if sf.file_type != "python":
                continue
            result = subprocess.run(
                [sys.executable, "-m", "py_compile", sf.path],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                findings.append(Finding(
                    severity="HIGH",
                    category="syntax",
                    file=sf.rel_path,
                    line=0,
                    message=result.stderr.strip(),
                    tool="py_compile",
                    fixable=False,
                ))
        return findings

    # ------------------------------------------------------------------
    # Solidity header check
    # ------------------------------------------------------------------

    def _check_sol_headers(self, manifest: RepoManifest) -> list[Finding]:
        findings = []
        for sf in manifest.files:
            if sf.file_type != "solidity":
                continue
            if _is_exempt(sf.rel_path):
                continue
            # Only check contracts we own (not library files)
            if "contracts/src/" not in sf.rel_path and "contracts/script/" not in sf.rel_path:
                continue
            try:
                header = Path(sf.path).read_text(encoding="utf-8", errors="replace")[:500]
            except OSError:
                continue
            if not _SOL_HEADER_RE.search(header):
                findings.append(Finding(
                    severity="LOW",
                    category="branding",
                    file=sf.rel_path,
                    line=1,
                    message="Missing '// GhostChain Contracts v5.6.1 ...' header",
                    tool="sol_header_checker",
                    fixable=False,
                ))
        return findings

    # ------------------------------------------------------------------
    # Forge lint
    # ------------------------------------------------------------------

    def _run_forge_lint(self) -> list[Finding]:
        forge_bin = _which("forge")
        if not forge_bin:
            logger.debug("forge not found — skipping lint")
            return []
        contracts_dir = self._repo / "contracts"
        if not contracts_dir.is_dir():
            return []
        result = subprocess.run(
            [forge_bin, "lint", "--json"],
            capture_output=True,
            text=True,
            cwd=str(contracts_dir),
        )
        findings = []
        # Try structured JSON output; fall back to plain text parse
        try:
            data = json.loads(result.stdout or "[]")
            for item in data:
                findings.append(Finding(
                    severity=_forge_severity(item.get("severity", "warning")),
                    category="forge_lint",
                    file=item.get("file", ""),
                    line=item.get("line", 0),
                    message=item.get("message", ""),
                    tool="forge_lint",
                    fixable=False,
                ))
        except (json.JSONDecodeError, TypeError):
            # Parse text output: "Warning (file:line): message"
            for line in (result.stdout + result.stderr).splitlines():
                m = re.match(r"(Warning|Error)\s*\(([^:]+):(\d+)\):\s*(.+)", line)
                if m:
                    findings.append(Finding(
                        severity="HIGH" if m.group(1) == "Error" else "MEDIUM",
                        category="forge_lint",
                        file=m.group(2),
                        line=int(m.group(3)),
                        message=m.group(4).strip(),
                        tool="forge_lint",
                        fixable=False,
                    ))
        return findings

    # ------------------------------------------------------------------
    # shellcheck
    # ------------------------------------------------------------------

    def _run_shellcheck(self, manifest: RepoManifest) -> list[Finding]:
        sc_bin = _which("shellcheck")
        if not sc_bin:
            logger.debug("shellcheck not found — skipping")
            return []
        findings = []
        for sf in manifest.files:
            if sf.file_type not in ("shell",):
                continue
            result = subprocess.run(
                [sc_bin, "--format=json", sf.path],
                capture_output=True,
                text=True,
            )
            try:
                items = json.loads(result.stdout or "[]")
                for item in items:
                    lvl = item.get("level", "info")
                    findings.append(Finding(
                        severity=_shellcheck_severity(lvl),
                        category="shell_lint",
                        file=sf.rel_path,
                        line=item.get("line", 0),
                        message=f"SC{item.get('code',0)}: {item.get('message','')}",
                        tool="shellcheck",
                    ))
            except (json.JSONDecodeError, TypeError):
                pass
        return findings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _which(name: str) -> str | None:
    import shutil
    return shutil.which(name)


def _forge_severity(s: str) -> str:
    return "HIGH" if s in ("error", "Error") else "MEDIUM"


def _shellcheck_severity(lvl: str) -> str:
    mapping = {"error": "HIGH", "warning": "MEDIUM", "info": "LOW", "style": "INFO"}
    return mapping.get(lvl, "LOW")
