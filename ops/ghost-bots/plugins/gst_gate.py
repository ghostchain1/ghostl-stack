from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    kind: str
    title: str
    summary: str
    subsystem: str
    chain_layer: str
    service: str
    payload: dict[str, Any]


def _run(repo_root: str, cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True)


_HEX_32B_RE = re.compile(r"0x[a-fA-F0-9]{64}\b")
_SENSITIVE_ENV_RE = re.compile(
    r"(?i)(\b[A-Z0-9_]*(?:PRIVATE_KEY|MNEMONIC|PASSWORD|SECRET|API_KEY|TOKEN)[A-Z0-9_]*=)[^\n]*"
)
_SENSITIVE_JSON_RE = re.compile(
    r'(?i)("(?:privateKey|mnemonic|password|secret|apiKey|token)"\s*:\s*")[^"]*(")'
)


def _redact(text: str) -> str:
    if not text:
        return ""
    out = text
    out = _HEX_32B_RE.sub("0x<redacted>", out)
    out = _SENSITIVE_ENV_RE.sub(r"\1<redacted>", out)
    out = _SENSITIVE_JSON_RE.sub(r"\1<redacted>\2", out)
    return out


def check_gst_leakage(repo_root: str) -> CheckResult:
    proc = _run(repo_root, ["bash", "scripts/gst-leakage-gate.sh"])
    ok = proc.returncode == 0
    stdout = _redact((proc.stdout or "").strip())
    stderr = _redact((proc.stderr or "").strip())
    return CheckResult(
        ok=ok,
        kind="gst_leakage_gate",
        title="GST leakage gate",
        summary="pass" if ok else "fail",
        subsystem="policy",
        chain_layer="",
        service="repo",
        payload={
            "exitCode": proc.returncode,
            "stdout": stdout[-4000:],
            "stderr": stderr[-4000:],
        },
    )


def check_gst_symbol(repo_root: str) -> CheckResult:
    proc = _run(repo_root, ["bash", "scripts/gst-symbol-gate.sh"])
    ok = proc.returncode == 0
    stdout = _redact((proc.stdout or "").strip())
    stderr = _redact((proc.stderr or "").strip())
    return CheckResult(
        ok=ok,
        kind="gst_symbol_gate",
        title="GST symbol gate",
        summary="pass" if ok else "fail",
        subsystem="policy",
        chain_layer="",
        service="repo",
        payload={
            "exitCode": proc.returncode,
            "stdout": stdout[-4000:],
            "stderr": stderr[-4000:],
        },
    )
