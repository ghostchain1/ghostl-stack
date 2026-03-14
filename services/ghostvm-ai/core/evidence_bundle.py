from __future__ import annotations

import hashlib
import json
import tarfile
from pathlib import Path
from typing import Any

from core.common import ensure_dir, utc_ts, write_json, write_md


def _latest_dir(path: Path) -> Path | None:
    if not path.exists():
        return None
    dirs = sorted([p for p in path.iterdir() if p.is_dir()])
    return dirs[-1] if dirs else None


def _recent_dirs(path: Path, depth: int) -> list[Path]:
    if not path.exists():
        return []
    dirs = sorted([p for p in path.iterdir() if p.is_dir()])
    if depth <= 0:
        return dirs
    return dirs[-depth:]


def _copy_if_exists(src: Path, dst: Path) -> bool:
    if not src.exists():
        return False
    ensure_dir(dst.parent)
    dst.write_bytes(src.read_bytes())
    return True


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _manifest_digest(manifest: dict[str, Any]) -> str:
    payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _manifest_digest_without_signing(manifest: dict[str, Any]) -> str:
    payload = {k: v for k, v in manifest.items() if k != "signing"}
    return _manifest_digest(payload)


def _resolve_bundle_root(root: Path, output: str | None) -> Path:
    if output:
        target = Path(output).expanduser()
        return target if target.is_absolute() else (root / target)
    return root / "bundles"


def create_evidence_bundle(
    root: Path,
    plans_dir: Path,
    evidence_dir: Path,
    output: str | None = None,
    sign: bool = False,
) -> dict[str, Any]:
    ts = utc_ts()
    bundle_root = ensure_dir(_resolve_bundle_root(root, output))
    out_dir = ensure_dir(bundle_root / ts)

    latest_plan = _latest_dir(plans_dir)
    latest_evidence = _latest_dir(evidence_dir)

    copied: list[str] = []

    if latest_plan:
        for name in ["plan.json", "diff.md", "rollback.md", "nft-remediation.json", "nft-remediation.md", "nftables-remediation.conf"]:
            src = latest_plan / name
            dst = out_dir / "plan" / name
            if _copy_if_exists(src, dst):
                copied.append(str(dst.relative_to(out_dir)))

    if latest_evidence:
        for name in ["network-verification.json", "network-verification.md"]:
            src = latest_evidence / name
            dst = out_dir / "verification" / name
            if _copy_if_exists(src, dst):
                copied.append(str(dst.relative_to(out_dir)))

    summary_lines = [
        f"# GhostNetSync Evidence Bundle {ts}",
        "",
        f"- Source plan dir: {latest_plan if latest_plan else 'none'}",
        f"- Source verification dir: {latest_evidence if latest_evidence else 'none'}",
        "",
        "## Included Files",
    ]
    for item in copied:
        summary_lines.append(f"- {item}")
    write_md(out_dir / "SUMMARY.md", "\n".join(summary_lines) + "\n")

    manifest = {
        "bundle_id": ts,
        "bundle_dir": str(out_dir),
        "source": {
            "plan": str(latest_plan) if latest_plan else None,
            "verification": str(latest_evidence) if latest_evidence else None,
        },
        "files": copied,
    }
    write_json(out_dir / "manifest.json", manifest)

    tar_path = bundle_root / f"ghostnetsync-evidence-{ts}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(out_dir, arcname=out_dir.name)

    manifest["archive"] = str(tar_path)
    if sign:
        manifest["signing"] = {
            "archive_sha256": _sha256_file(tar_path),
            "manifest_sha256": _manifest_digest_without_signing(manifest),
            "algorithm": "sha256",
        }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"ok": True, **manifest}


def create_evidence_bundle_include_all(
    root: Path,
    plans_dir: Path,
    evidence_dir: Path,
    depth: int = 10,
    output: str | None = None,
    sign: bool = False,
) -> dict[str, Any]:
    ts = utc_ts()
    bundle_root = ensure_dir(_resolve_bundle_root(root, output))
    out_dir = ensure_dir(bundle_root / ts)

    plan_dirs = _recent_dirs(plans_dir, depth)
    evidence_dirs = _recent_dirs(evidence_dir, depth)

    copied: list[str] = []

    for plan_dir in plan_dirs:
        for name in ["plan.json", "diff.md", "rollback.md", "nft-remediation.json", "nft-remediation.md", "nftables-remediation.conf"]:
            src = plan_dir / name
            dst = out_dir / "plans" / plan_dir.name / name
            if _copy_if_exists(src, dst):
                copied.append(str(dst.relative_to(out_dir)))

    for verify_dir in evidence_dirs:
        for name in ["network-verification.json", "network-verification.md"]:
            src = verify_dir / name
            dst = out_dir / "verification" / verify_dir.name / name
            if _copy_if_exists(src, dst):
                copied.append(str(dst.relative_to(out_dir)))

    summary_lines = [
        f"# GhostNetSync Evidence Bundle (Include-All) {ts}",
        "",
        f"- Included plan dirs: {len(plan_dirs)}",
        f"- Included verification dirs: {len(evidence_dirs)}",
        f"- Depth: {depth}",
        "",
        "## Included Files",
    ]
    for item in copied:
        summary_lines.append(f"- {item}")
    write_md(out_dir / "SUMMARY.md", "\n".join(summary_lines) + "\n")

    manifest = {
        "bundle_id": ts,
        "bundle_dir": str(out_dir),
        "mode": "include_all",
        "depth": depth,
        "source": {
            "plans": [str(p) for p in plan_dirs],
            "verification": [str(v) for v in evidence_dirs],
        },
        "files": copied,
    }
    write_json(out_dir / "manifest.json", manifest)

    tar_path = bundle_root / f"ghostnetsync-evidence-all-{ts}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(out_dir, arcname=out_dir.name)

    manifest["archive"] = str(tar_path)
    if sign:
        manifest["signing"] = {
            "archive_sha256": _sha256_file(tar_path),
            "manifest_sha256": _manifest_digest_without_signing(manifest),
            "algorithm": "sha256",
        }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"ok": True, **manifest}


def verify_evidence_bundle(bundle_dir: str) -> dict[str, Any]:
    target = Path(bundle_dir).expanduser()
    manifest_path = target / "manifest.json"
    if not manifest_path.exists():
        return {
            "ok": False,
            "reason": f"missing_manifest:{manifest_path}",
            "checks": [{"name": "manifest_exists", "ok": False, "details": str(manifest_path)}],
        }

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    signing = manifest.get("signing")
    archive_path = Path(manifest.get("archive", ""))
    if not archive_path.is_absolute():
        archive_path = (target / archive_path).resolve()

    checks: list[dict[str, Any]] = []

    checks.append({"name": "manifest_exists", "ok": True, "details": str(manifest_path)})
    checks.append({"name": "archive_exists", "ok": archive_path.exists(), "details": str(archive_path)})

    if signing:
        expected_archive = signing.get("archive_sha256")
        expected_manifest = signing.get("manifest_sha256")

        archive_ok = False
        archive_actual = ""
        if archive_path.exists():
            archive_actual = _sha256_file(archive_path)
            archive_ok = archive_actual == expected_archive
        checks.append(
            {
                "name": "archive_sha256",
                "ok": archive_ok,
                "details": f"expected={expected_archive} actual={archive_actual}",
            }
        )

        manifest_actual = _manifest_digest_without_signing(manifest)
        checks.append(
            {
                "name": "manifest_sha256",
                "ok": manifest_actual == expected_manifest,
                "details": f"expected={expected_manifest} actual={manifest_actual}",
            }
        )
    else:
        checks.append({"name": "signing_present", "ok": False, "details": "manifest.signing missing"})

    return {
        "ok": all(c.get("ok", False) for c in checks),
        "bundle_dir": str(target),
        "manifest": str(manifest_path),
        "checks": checks,
    }


def bundle_verify_exit_code(result: dict[str, Any]) -> int:
    if result.get("ok"):
        return 0

    checks = {c.get("name"): c for c in result.get("checks", [])}
    if not checks.get("manifest_exists", {}).get("ok", True):
        return 2
    if not checks.get("archive_exists", {}).get("ok", True):
        return 3
    if not checks.get("archive_sha256", {}).get("ok", True):
        return 4
    if not checks.get("manifest_sha256", {}).get("ok", True):
        return 5
    if not checks.get("signing_present", {"ok": True}).get("ok", True):
        return 6
    return 1
