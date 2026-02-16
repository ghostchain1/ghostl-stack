#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime
import hashlib
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.policy import assert_allowed_research_url  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch and cache official docs (allowlist enforced).")
    ap.add_argument("url")
    ap.add_argument("--cache-dir", default=None)
    args = ap.parse_args()

    assert_allowed_research_url(args.url)

    cache_dir = Path(args.cache_dir) if args.cache_dir else CODE_ROOT / "cache"

    parsed = urlparse(args.url)
    host = (parsed.hostname or "unknown").replace(":", "_")
    if parsed.port:
        host = f"{host}_{parsed.port}"
    day = os.environ.get("GHOST_BOTS_DAY") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    h = hashlib.sha256(args.url.encode("utf-8")).hexdigest()[:16]

    out_dir = cache_dir / host / day
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{h}.txt"

    req = Request(args.url, headers={"User-Agent": "ghost-bots/0.1"})
    with urlopen(req, timeout=10) as resp:
        data = resp.read(512 * 1024)  # cap 512KiB

    out_path.write_bytes(data)
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
