from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class Paths:
    root: Path
    config_dir: Path
    state_dir: Path
    plans_dir: Path
    evidence_dir: Path
    governance_dir: Path


@dataclass(slots=True)
class PlanAction:
    id: str
    phase: str
    description: str
    command: list[str]
    destructive: bool = False
    rollback: list[str] = field(default_factory=list)


@dataclass(slots=True)
class VerificationCheck:
    name: str
    ok: bool
    details: str
