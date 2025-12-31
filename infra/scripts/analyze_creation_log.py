#!/usr/bin/env python3
"""
Analyze a Codespaces creation log and report warnings and errors.

Usage:
    python analyze_creation_log.py [--path PATH]

If PATH is not provided, common Codespaces locations are checked in
order: /workspaces/.codespaces/.persistedshare/creation.log and
/workspace/.codespaces/.persistedshare/creation.log.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

DEFAULT_LOCATIONS = [
    Path("/workspaces/.codespaces/.persistedshare/creation.log"),
    Path("/workspace/.codespaces/.persistedshare/creation.log"),
]


@dataclass
class LogStats:
    path: Path
    total_lines: int
    errors: List[str]
    warnings: List[str]

    @property
    def error_count(self) -> int:
        return len(self.errors)

    @property
    def warning_count(self) -> int:
        return len(self.warnings)


def locate_log(explicit_path: Optional[str]) -> Path:
    if explicit_path:
        candidate = Path(explicit_path).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"Log file not found at provided path: {candidate}")

    for location in DEFAULT_LOCATIONS:
        if location.is_file():
            return location

    raise FileNotFoundError(
        "No creation.log found. Checked: "
        + ", ".join(str(path) for path in DEFAULT_LOCATIONS)
    )


def classify_line(line: str) -> Optional[str]:
    lower = line.lower()
    if "error" in lower:
        return "error"
    if "warn" in lower:
        return "warning"
    return None


def collect_highlights(lines: Iterable[str]) -> LogStats:
    errors: List[str] = []
    warnings: List[str] = []
    total_lines = 0

    for line in lines:
        total_lines += 1
        level = classify_line(line)
        trimmed = line.rstrip("\n")
        if level == "error":
            errors.append(trimmed)
        elif level == "warning":
            warnings.append(trimmed)

    return LogStats(path=Path(""), total_lines=total_lines, errors=errors, warnings=warnings)


def analyze_log(path: Path) -> LogStats:
    content = path.read_text(errors="ignore").splitlines()
    stats = collect_highlights(content)
    return LogStats(path=path, total_lines=stats.total_lines, errors=stats.errors, warnings=stats.warnings)


def format_section(title: str, items: List[str]) -> str:
    if not items:
        return f"- {title}: none found"

    trimmed = items[-5:]
    bullet_lines = "\n".join(f"  - {line}" for line in trimmed)
    return f"- {title} (showing last {len(trimmed)}):\n{bullet_lines}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Codespaces creation.log issues")
    parser.add_argument("--path", help="Optional path to creation.log")
    args = parser.parse_args()

    try:
        log_path = locate_log(args.path)
    except FileNotFoundError as exc:
        print(exc)
        return 1

    stats = analyze_log(log_path)

    print(f"Analyzed log: {stats.path}")
    print(f"Total lines: {stats.total_lines}")
    print(f"Errors: {stats.error_count}")
    print(f"Warnings: {stats.warning_count}")
    print(format_section("Recent errors", stats.errors))
    print(format_section("Recent warnings", stats.warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
