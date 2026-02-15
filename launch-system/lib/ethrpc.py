#!/usr/bin/env python3
"""
Deprecated shim for legacy callers.

Use `evmrpc.py` instead.
"""

from __future__ import annotations

import sys
from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(LIB_DIR))

from evmrpc import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
