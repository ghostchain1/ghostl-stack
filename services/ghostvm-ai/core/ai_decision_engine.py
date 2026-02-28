from __future__ import annotations

from typing import Any

from core.policy.policy_guard import detect_subnet_overlaps


def recommend_plan_adjustments(ndsm: dict[str, Any], discovered: dict[str, Any]) -> dict[str, Any]:
    overlaps = detect_subnet_overlaps(ndsm)
    recs: list[str] = []
    migrations: list[dict[str, str]] = []

    if overlaps:
        recs.append("Subnet overlap detected; create parallel docker network and staged container cutover.")
        for idx, item in enumerate(overlaps, start=1):
            migrations.append(
                {
                    "id": f"safe-migration-{idx}",
                    "reason": item,
                    "strategy": "parallel_network_then_cutover",
                }
            )

    if discovered.get("docker", {}).get("network_count", 0) > 15:
        recs.append("High docker network count detected; evaluate consolidation per layer labels.")

    return {
        "recommendations": recs,
        "migrations": migrations,
    }
