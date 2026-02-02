#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ops/diagrams"
REPORT_PATH=""
SNAPSHOT_DIR=""

usage() {
  cat <<'USAGE'
Usage: generate-diagrams.sh [--report <path>] [--snapshot <dir>] [--out <dir>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) REPORT_PATH="$2"; shift 2;;
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --out) OUT_DIR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

mkdir -p "$OUT_DIR"

python3 - "$ROOT_DIR" "$OUT_DIR" "$REPORT_PATH" "$SNAPSHOT_DIR" <<'PY'
import json
import os
import re
import sys

root=sys.argv[1]
out_dir=sys.argv[2]
report_path=sys.argv[3]
snapshot_dir=sys.argv[4]

def load_json(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        return json.load(open(path))
    except Exception:
        return None

report=load_json(report_path)
if report and not snapshot_dir:
    snapshot_dir=report.get("snapshot") or ""

canonical_path=os.path.join(root,"ops","STACK_CANONICAL.yml")
canonical=load_json(canonical_path) or {}

def parse_ports(raw):
    ports=[]
    for item in raw or []:
        if isinstance(item,str):
            parts=item.split(":")
            ports.append(parts[-2] if len(parts)>=2 else parts[0])
        elif isinstance(item,dict):
            ports.append(str(item.get("published") or item.get("target") or ""))
    return [p for p in ports if p]

def parse_depends(raw):
    if not raw:
        return []
    if isinstance(raw,list):
        return raw
    if isinstance(raw,dict):
        return list(raw.keys())
    return []

def parse_networks(raw):
    if not raw:
        return []
    if isinstance(raw,list):
        return raw
    if isinstance(raw,dict):
        return list(raw.keys())
    return []

def infer_role(name):
    lower=name.lower()
    if "l1" in lower or "ghostchain" in lower:
        return "L1"
    if "l2" in lower or "op-" in lower:
        return "L2"
    if "l3" in lower:
        return "L3"
    return "OTHER"

def node_id(name):
    return re.sub(r"[^A-Za-z0-9_]", "_", name)

canonical_services=[]
for _, payload in (canonical.get("compose") or {}).items():
    for svc_name, cfg in (payload.get("services") or {}).items():
        canonical_services.append({
            "name": svc_name,
            "ports": parse_ports(cfg.get("ports",[])),
            "depends": parse_depends(cfg.get("depends_on")),
            "networks": parse_networks(cfg.get("networks"))
        })

runtime_services=[]
if report:
    for container in report.get("inventory",{}).get("containers",[]):
        runtime_services.append({
            "name": container.get("name") or container.get("service") or "",
            "ports": [p.get("hostPort") for p in container.get("ports",[]) if p.get("hostPort")],
            "depends": [],
            "networks": container.get("networks",[])
        })

def render_graph(services, title, include_networks):
    lines=["```mermaid", "graph TD"]
    buckets={}
    for svc in services:
        role=infer_role(svc["name"])
        buckets.setdefault(role, []).append(svc)
    for role, items in buckets.items():
        lines.append(f"  subgraph {role}")
        for svc in items:
            nid=node_id(svc["name"])
            port_label=",".join(svc.get("ports") or [])
            label=f"{svc['name']}\\nports:{port_label}" if port_label else svc["name"]
            lines.append(f"    {nid}[\"{label}\"]")
        lines.append("  end")

    depends_edges=set()
    for svc in services:
        for dep in svc.get("depends") or []:
            depends_edges.add((svc["name"], dep))
    for src, dst in sorted(depends_edges):
        lines.append(f"  {node_id(src)} --> {node_id(dst)}")

    if include_networks:
        networks=set()
        for svc in services:
            for net in svc.get("networks") or []:
                networks.add(net)
        for net in sorted(networks):
            nid=node_id(f"net_{net}")
            lines.append(f"  {nid}((\"{net}\"))")
            for svc in services:
                if net in (svc.get("networks") or []):
                    lines.append(f"  {node_id(svc['name'])} -.-> {nid}")

    lines.append("```")
    return "\n".join(lines)

runtime_graph=render_graph(runtime_services, "Runtime Topology", True) if runtime_services else "```mermaid\ngraph TD\n```"
canonical_graph=render_graph(canonical_services, "Canonical Topology", True) if canonical_services else "```mermaid\ngraph TD\n```"

dup_lines=["```mermaid","graph LR"]
duplicates=[]
if report:
    duplicates=report.get("duplicates",{}).get("containerClusters",[]) or []
if duplicates:
    for cluster in duplicates:
        role=cluster.get("role","unknown")
        dup_lines.append(f"  subgraph {role}")
        canonical_name=cluster.get("canonical") or "canonical"
        dup_lines.append(f"    {node_id(canonical_name)}[\"canonical: {canonical_name}\"]")
        for member in cluster.get("members",[]):
            name=member.get("name")
            if not name or name==canonical_name:
                continue
            dup_lines.append(f"    {node_id(name)}[\"dup: {name}\"]")
        dup_lines.append("  end")
else:
    dup_lines.append("  none[\"no duplicate clusters\"]")
dup_lines.append("```")

with open(os.path.join(out_dir,"runtime-topology.md"),"w") as fh:
    fh.write("# Runtime Topology\n\n")
    fh.write(runtime_graph)
    fh.write("\n")

with open(os.path.join(out_dir,"canonical-topology.md"),"w") as fh:
    fh.write("# Desired Canonical Topology\n\n")
    fh.write(canonical_graph)
    fh.write("\n")

with open(os.path.join(out_dir,"duplicate-clusters.md"),"w") as fh:
    fh.write("# Duplicate Clusters\n\n")
    fh.write("\n".join(dup_lines))
    fh.write("\n")
PY

echo "Diagrams written to $OUT_DIR"
