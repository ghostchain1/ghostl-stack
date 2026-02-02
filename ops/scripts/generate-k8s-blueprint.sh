#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ops/k8s-blueprint"
REPORT_PATH=""

usage() {
  cat <<'USAGE'
Usage: generate-k8s-blueprint.sh [--report <path>] [--out <dir>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) REPORT_PATH="$2"; shift 2;;
    --out) OUT_DIR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

mkdir -p "$OUT_DIR"

python3 - "$ROOT_DIR" "$OUT_DIR" "$REPORT_PATH" <<'PY'
import json
import os
import re
import sys
from datetime import datetime

root=sys.argv[1]
out_dir=sys.argv[2]
report_path=sys.argv[3]

def load_json(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        return json.load(open(path))
    except Exception:
        return None

report=load_json(report_path) or {}
canonical_path=os.path.join(root,"ops","STACK_CANONICAL.yml")
canonical=load_json(canonical_path) or {}

def parse_ports(raw):
    ports=[]
    for item in raw or []:
        if isinstance(item,str):
            parts=item.split(":")
            published=""
            target=""
            if len(parts)==1:
                target=parts[0]
            elif len(parts)>=2:
                published=parts[-2]
                target=parts[-1]
            ports.append({"published": published, "target": target})
        elif isinstance(item,dict):
            ports.append({
                "published": str(item.get("published") or ""),
                "target": str(item.get("target") or "")
            })
    return [p for p in ports if p.get("target") or p.get("published")]

def parse_networks(raw):
    if isinstance(raw,list):
        return raw
    if isinstance(raw,dict):
        return list(raw.keys())
    return []

def parse_volumes(raw):
    vols=[]
    for item in raw or []:
        if isinstance(item,str):
            parts=item.split(":")
            source=parts[0] if len(parts)>=2 else ""
            target=parts[1] if len(parts)>=2 else parts[0]
            vols.append({"source": source, "target": target})
        elif isinstance(item,dict):
            vols.append({
                "source": item.get("source") or "",
                "target": item.get("target") or ""
            })
    return vols

def parse_env(raw):
    if isinstance(raw,dict):
        return list(raw.keys())
    if isinstance(raw,list):
        keys=[]
        for item in raw:
            if isinstance(item,str):
                keys.append(item.split("=",1)[0])
        return keys
    return []

def sanitize(name):
    name=name.lower()
    name=re.sub(r"[^a-z0-9-]+","-",name)
    return name.strip("-") or "service"

def infer_role(name):
    lower=name.lower()
    if "l1" in lower or "ghostchain" in lower:
        return "l1"
    if "l2" in lower or "op-" in lower:
        return "l2"
    if "l3" in lower:
        return "l3"
    return "other"

def dump_yaml(obj, indent=0):
    lines=[]
    space=" " * indent
    if isinstance(obj,dict):
        for k,v in obj.items():
            if isinstance(v,(dict,list)):
                lines.append(f"{space}{k}:")
                lines.extend(dump_yaml(v, indent+2))
            else:
                if isinstance(v,bool):
                    val="true" if v else "false"
                elif v is None:
                    val="null"
                elif isinstance(v,(int,float)):
                    val=str(v)
                else:
                    text=str(v)
                    if text=="" or any(ch in text for ch in [":","#","{","}","[","]",","," "]):
                        text="\""+text.replace("\"","\\\"")+"\""
                    val=text
                lines.append(f"{space}{k}: {val}")
    elif isinstance(obj,list):
        for item in obj:
            if isinstance(item,(dict,list)):
                lines.append(f"{space}-")
                lines.extend(dump_yaml(item, indent+2))
            else:
                lines.append(f"{space}- {item}")
    return lines

resources=[]
volume_claims=[]
config_maps=[]
secrets=[]

chain_tokens=("geth","op-geth","op-node","chaindata","datadir","execution","consensus","polygon-edge","rollup","jwt","genesis","db")

for file_key, payload in (canonical.get("compose") or {}).items():
    for svc_name, cfg in (payload.get("services") or {}).items():
        k8s_name=sanitize(svc_name)
        role=infer_role(svc_name)
        ports=parse_ports(cfg.get("ports",[]))
        env_keys=parse_env(cfg.get("environment"))
        volumes=parse_volumes(cfg.get("volumes",[]))
        image=cfg.get("image") or f"{svc_name}:local"

        chain_candidate=any(token in svc_name.lower() for token in chain_tokens)
        if not chain_candidate:
            for vol in volumes:
                if any(token in (vol.get("source","")+vol.get("target","")).lower() for token in chain_tokens):
                    chain_candidate=True

        annotations={
            "ghostchain.io/chain-data": "true" if chain_candidate else "false",
            "ghostchain.io/phase-gated": "true" if role in ("l1","l2","l3") else "false",
            "ghostchain.io/ports": ",".join([p.get("published") or p.get("target") for p in ports if p.get("published") or p.get("target")]),
            "ghostchain.io/port-collision-avoid": "true"
        }

        config_keys=[k for k in env_keys if k and not any(token in k.upper() for token in ("SECRET","KEY","PASSWORD","TOKEN","PRIVATE","JWT"))]
        secret_keys=[k for k in env_keys if k and k not in config_keys]

        if config_keys:
            config_maps.append({
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": f"{k8s_name}-config"},
                "data": {k: "REPLACE_ME" for k in config_keys}
            })

        if secret_keys:
            secrets.append({
                "apiVersion": "v1",
                "kind": "Secret",
                "metadata": {"name": f"{k8s_name}-secret"},
                "type": "Opaque",
                "stringData": {k: "REPLACE_ME" for k in secret_keys}
            })

        volume_mounts=[]
        pod_volumes=[]
        for vol in volumes:
            source=vol.get("source") or ""
            target=vol.get("target") or ""
            if not target:
                continue
            claim_name=sanitize(f"{k8s_name}-{source or target}")
            volume_mounts.append({"name": claim_name, "mountPath": target})
            pod_volumes.append({"name": claim_name, "persistentVolumeClaim": {"claimName": claim_name}})
            volume_claims.append({
                "apiVersion": "v1",
                "kind": "PersistentVolumeClaim",
                "metadata": {
                    "name": claim_name,
                    "annotations": {
                        "ghostchain.io/chain-data": "true" if chain_candidate else "false",
                        "ghostchain.io/source": source or ""
                    }
                },
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {"requests": {"storage": "50Gi"}}
                }
            })

        workload="StatefulSet" if chain_candidate or volume_mounts else "Deployment"
        container_ports=[{"containerPort": int(p.get("target") or 0)} for p in ports if p.get("target") and str(p.get("target")).isdigit()]

        pod_spec={
            "containers": [{
                "name": k8s_name,
                "image": image,
                "ports": container_ports,
                "envFrom": [],
                "volumeMounts": volume_mounts
            }],
            "volumes": pod_volumes
        }
        if config_keys:
            pod_spec["containers"][0]["envFrom"].append({"configMapRef": {"name": f"{k8s_name}-config"}})
        if secret_keys:
            pod_spec["containers"][0]["envFrom"].append({"secretRef": {"name": f"{k8s_name}-secret"}})
        if role in ("l1","l2","l3"):
            pod_spec["affinity"]={
                "nodeAffinity": {
                    "requiredDuringSchedulingIgnoredDuringExecution": {
                        "nodeSelectorTerms": [{
                            "matchExpressions": [{
                                "key": "ghostchain.io/layer",
                                "operator": "In",
                                "values": [role]
                            }]
                        }]
                    }
                }
            }

        spec={
            "selector": {"matchLabels": {"app": k8s_name}},
            "template": {
                "metadata": {"labels": {"app": k8s_name}},
                "spec": pod_spec
            }
        }
        if workload=="Deployment":
            spec["replicas"]=1
        if workload=="StatefulSet":
            spec["serviceName"]=k8s_name

        resources.append({
            "apiVersion": "apps/v1",
            "kind": workload,
            "metadata": {"name": k8s_name, "annotations": annotations},
            "spec": spec
        })

        if ports:
            svc_ports=[]
            for idx,p in enumerate(ports):
                target=p.get("target") or p.get("published")
                if not target:
                    continue
                port=int(target) if str(target).isdigit() else 0
                if port==0:
                    continue
                svc_ports.append({"name": f"port-{idx}", "port": port, "targetPort": port})
            if svc_ports:
                resources.append({
                    "apiVersion": "v1",
                    "kind": "Service",
                    "metadata": {"name": k8s_name, "annotations": annotations},
                    "spec": {
                        "selector": {"app": k8s_name},
                        "ports": svc_ports
                    }
                })

docs=[]
docs.extend(config_maps)
docs.extend(secrets)
docs.extend(volume_claims)
docs.extend(resources)

yaml_lines=[]
for doc in docs:
    yaml_lines.append("---")
    yaml_lines.extend(dump_yaml(doc))

blueprint_path=os.path.join(out_dir,"blueprint.yaml")
with open(blueprint_path,"w") as fh:
    fh.write("\n".join(yaml_lines))
    fh.write("\n")

summary_path=os.path.join(out_dir,"summary.md")
workloads=[r for r in resources if r.get("kind") in ("Deployment","StatefulSet")]
services_out=[r for r in resources if r.get("kind")=="Service"]
summary_lines=[
    "# K8s Blueprint Summary",
    f"- Generated: {datetime.utcnow().isoformat()}Z",
    f"- Workloads: {len(workloads)}",
    f"- Services: {len(services_out)}",
    f"- PVCs: {len(volume_claims)}",
    f"- ConfigMaps: {len(config_maps)}",
    f"- Secrets: {len(secrets)}",
    "",
    "Notes:",
    "- This blueprint is migration-safe and uses placeholders for secrets.",
    "- StatefulSet is used for chain or persistent volumes.",
    "- Annotations include chain data and port collision hints."
]
with open(summary_path,"w") as fh:
    fh.write("\n".join(summary_lines))
PY

echo "Blueprint written to $OUT_DIR/blueprint.yaml"
