from __future__ import annotations

import shlex
import subprocess


def command_ok(command: str) -> bool:
    result = subprocess.run(shlex.split(command), check=False, capture_output=True, text=True)
    return result.returncode == 0


def health_status() -> dict:
    named_ok = command_ok("pgrep named")
    return {
        "ok": named_ok,
        "named_running": named_ok,
    }
