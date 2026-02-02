#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_PATH="$ROOT_DIR/ops/cleanup-agent/config.json"
MODE="dev"
SNAPSHOT_DIR=""
APPLY="false"
ENFORCE="false"
REPORT_DIR="$ROOT_DIR/ops/reports"
DIAGRAMS="false"
K8S_BLUEPRINT="false"
PRECHECK="true"
SKIP_SNAPSHOT="false"

usage() {
  cat <<'USAGE'
Usage: cleanup.sh [--config <path>] [--snapshot <dir>] [--mode dev|prod] [--plan|--dry-run] [--apply --enforce] [--report-dir <dir>] [--diagrams] [--k8s-blueprint] [--no-precheck] [--skip-snapshot]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG_PATH="$2"; shift 2;;
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --plan|--dry-run) APPLY="false"; shift;;
    --apply) APPLY="true"; shift;;
    --enforce) ENFORCE="true"; shift;;
    --report-dir) REPORT_DIR="$2"; shift 2;;
    --diagrams) DIAGRAMS="true"; shift;;
    --k8s-blueprint) K8S_BLUEPRINT="true"; shift;;
    --no-precheck) PRECHECK="false"; shift;;
    --skip-snapshot) SKIP_SNAPSHOT="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Missing config: $CONFIG_PATH" >&2
  exit 1
fi

ENFORCE_ENV="$(python3 - "$CONFIG_PATH" <<'PY'
import json,sys
cfg=json.load(open(sys.argv[1]))
print(cfg.get("enforceFlagEnv","GHOST_CLEANUP_ENFORCE"))
PY
)"

if [[ "$APPLY" == "true" ]]; then
  if [[ "$ENFORCE" != "true" && "${!ENFORCE_ENV:-}" != "true" ]]; then
    echo "Apply requires --enforce or ${ENFORCE_ENV}=true" >&2
    exit 1
  fi
  if [[ "$SKIP_SNAPSHOT" == "true" ]]; then
    echo "--skip-snapshot is not allowed with --apply" >&2
    exit 1
  fi
  if [[ "$PRECHECK" == "true" ]]; then
    if [[ -x "$ROOT_DIR/ops/scripts/preflight.sh" ]]; then
      "$ROOT_DIR/ops/scripts/preflight.sh"
    fi
    if [[ -x "$ROOT_DIR/ops/scripts/verify.sh" ]]; then
      "$ROOT_DIR/ops/scripts/verify.sh" --strict
    fi
  fi
fi

if [[ -z "$SNAPSHOT_DIR" && "$SKIP_SNAPSHOT" != "true" ]]; then
  snapshot_output="$("$ROOT_DIR/ops/scripts/snapshot.sh" $( [[ "$APPLY" == "true" ]] && echo "--require-docker" ))"
  printf '%s\n' "$snapshot_output"
  SNAPSHOT_DIR="$(printf '%s\n' "$snapshot_output" | tail -n1)"
fi

if [[ "$SKIP_SNAPSHOT" != "true" ]]; then
  if [[ -z "$SNAPSHOT_DIR" || ! -d "$SNAPSHOT_DIR" ]]; then
    echo "Snapshot directory unavailable." >&2
    exit 1
  fi
fi

mkdir -p "$REPORT_DIR"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
REPORT_JSON="$REPORT_DIR/cleanup-report-$RUN_ID.json"
REPORT_MD="$REPORT_DIR/cleanup-report-$RUN_ID.md"
PLAN_JSON="$REPORT_DIR/cleanup-plan-$RUN_ID.json"

python3 - "$ROOT_DIR" "$CONFIG_PATH" "$SNAPSHOT_DIR" "$REPORT_JSON" "$REPORT_MD" "$PLAN_JSON" "$MODE" "$APPLY" <<'PY'
import datetime
import json
import os
import subprocess
import sys

root=sys.argv[1]
config_path=sys.argv[2]
snapshot_dir=sys.argv[3]
report_json=sys.argv[4]
report_md=sys.argv[5]
plan_json=sys.argv[6]
mode=sys.argv[7]
apply_flag=sys.argv[8].lower()=="true"

snapshot_ok=os.path.isdir(snapshot_dir)
if not snapshot_ok:
    snapshot_dir=""

config=json.load(open(config_path))

def run(cmd, timeout=20):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", "timeout")

def docker_available():
    try:
        result=run(["docker","info"], timeout=5)
        return result.returncode==0
    except Exception:
        return False

def read_json_lines(path):
    items=[]
    if not os.path.isfile(path):
        return items
    with open(path,"r") as fh:
        for line in fh:
            line=line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items

def parse_ports(raw):
    ports=[]
    if not raw:
        return ports
    for item in raw:
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
                "published": str(item.get("published") or item.get("host_port") or item.get("published_port") or ""),
                "target": str(item.get("target") or ""),
                "protocol": item.get("protocol")
            })
    return ports

def parse_networks(raw):
    if not raw:
        return []
    if isinstance(raw,list):
        return raw
    if isinstance(raw,dict):
        return list(raw.keys())
    return []

def parse_volumes(raw):
    vols=[]
    if not raw:
        return vols
    for item in raw:
        if isinstance(item,str):
            parts=item.split(":")
            source=parts[0] if len(parts)>=2 else ""
            target=parts[1] if len(parts)>=2 else parts[0]
            mode=parts[2] if len(parts)>=3 else ""
            vols.append({"source": source, "target": target, "mode": mode})
        elif isinstance(item,dict):
            vols.append({
                "source": item.get("source") or "",
                "target": item.get("target") or "",
                "mode": "ro" if item.get("read_only") else "rw"
            })
    return vols

def parse_depends(raw):
    if not raw:
        return []
    if isinstance(raw,list):
        return raw
    if isinstance(raw,dict):
        return list(raw.keys())
    return []

def infer_role(name, image, labels):
    roles=config.get("roles",{})
    hay=" ".join([name or "", image or ""] + [str(v) for v in (labels or {}).values()]).lower()
    for role,keywords in roles.items():
        for keyword in keywords:
            if keyword and keyword in hay:
                return role
    return "other"

def load_canonical():
    canonical_path=os.path.join(root,"ops","STACK_CANONICAL.yml")
    if not os.path.isfile(canonical_path):
        return None
    try:
        return json.load(open(canonical_path))
    except Exception:
        return None

canonical=load_canonical()
services=[]
compose_files=[]
compose_map={}

if canonical:
    compose_files=canonical.get("composeFiles",[]) or []
    compose_map=canonical.get("compose",{}) or {}
    for file_key, payload in compose_map.items():
        for svc_name, cfg in (payload.get("services",{}) or {}).items():
            entry={
                "service": svc_name,
                "composeFile": payload.get("file") or file_key,
                "image": cfg.get("image") or (f"{svc_name}:local" if cfg.get("build") else None),
                "ports": parse_ports(cfg.get("ports",[])),
                "networks": parse_networks(cfg.get("networks")),
                "volumes": parse_volumes(cfg.get("volumes",[])),
                "dependsOn": parse_depends(cfg.get("depends_on")),
                "labels": cfg.get("labels",{}) or {}
            }
            entry["role"]=infer_role(entry["service"], entry["image"], entry["labels"])
            services.append(entry)
else:
    compose_index_path=os.path.join(snapshot_dir,"compose-index.json")
    slug_map={}
    if os.path.isfile(compose_index_path):
        try:
            for item in json.load(open(compose_index_path)):
                slug_map[item.get("slug","")]=item.get("rel","")
        except Exception:
            slug_map={}
    compose_dir=os.path.join(snapshot_dir,"compose")
    if os.path.isdir(compose_dir):
        for fname in os.listdir(compose_dir):
            if not fname.endswith(".json"):
                continue
            slug=fname[:-5]
            path=os.path.join(compose_dir,fname)
            try:
                payload=json.load(open(path))
            except Exception:
                continue
            rel=slug_map.get(slug, slug)
            if rel not in compose_files:
                compose_files.append(rel)
            for svc_name, cfg in (payload.get("services",{}) or {}).items():
                entry={
                    "service": svc_name,
                    "composeFile": rel,
                    "image": cfg.get("image") or (f"{svc_name}:local" if cfg.get("build") else None),
                    "ports": parse_ports(cfg.get("ports",[])),
                    "networks": parse_networks(cfg.get("networks")),
                    "volumes": parse_volumes(cfg.get("volumes",[])),
                    "dependsOn": parse_depends(cfg.get("depends_on")),
                    "labels": cfg.get("labels",{}) or {}
                }
                entry["role"]=infer_role(entry["service"], entry["image"], entry["labels"])
                services.append(entry)

canonical_services=set([s["service"] for s in services])

docker_ok=docker_available()
containers=[]
networks=[]
volumes=[]
images=[]
volume_mounts={}

if docker_ok:
    ps=run(["docker","ps","-a","--format","{{json .}}"])
    if ps.returncode==0:
        containers_summary=[json.loads(line) for line in ps.stdout.splitlines() if line.strip()]
    else:
        containers_summary=[]

    ids=[c.get("ID") for c in containers_summary if c.get("ID")]
    if ids:
        inspect=run(["docker","inspect"] + ids)
        if inspect.returncode==0:
            inspect_data=json.loads(inspect.stdout)
        else:
            inspect_data=[]
    else:
        inspect_data=[]

    vol_ls=run(["docker","volume","ls","--format","{{json .}}"])
    if vol_ls.returncode==0:
        volumes=[json.loads(line) for line in vol_ls.stdout.splitlines() if line.strip()]
    net_ls=run(["docker","network","ls","--format","{{json .}}"])
    if net_ls.returncode==0:
        networks=[json.loads(line) for line in net_ls.stdout.splitlines() if line.strip()]
    img_ls=run(["docker","images","--format","{{json .}}"])
    if img_ls.returncode==0:
        images=[json.loads(line) for line in img_ls.stdout.splitlines() if line.strip()]

    vol_names=[v.get("Name") for v in volumes if v.get("Name")]
    if vol_names:
        vol_inspect=run(["docker","volume","inspect"] + vol_names)
        if vol_inspect.returncode==0:
            for item in json.loads(vol_inspect.stdout):
                if item.get("Name"):
                    volume_mounts[item.get("Name")]=item.get("Mountpoint")
else:
    containers_summary=read_json_lines(os.path.join(snapshot_dir,"inspect","docker-ps.json"))
    try:
        inspect_data=json.load(open(os.path.join(snapshot_dir,"inspect","docker-inspect.json")))
    except Exception:
        inspect_data=[]
    volumes=read_json_lines(os.path.join(snapshot_dir,"inspect","docker-volumes.json"))
    networks=read_json_lines(os.path.join(snapshot_dir,"inspect","docker-networks.json"))
    images=read_json_lines(os.path.join(snapshot_dir,"inspect","docker-images.json"))
    try:
        vol_inspect=json.load(open(os.path.join(snapshot_dir,"inspect","docker-volume-inspect.json")))
        for item in vol_inspect:
            if item.get("Name"):
                volume_mounts[item.get("Name")]=item.get("Mountpoint")
    except Exception:
        volume_mounts={}

for entry in inspect_data:
    labels=entry.get("Config",{}).get("Labels",{}) or {}
    name=(entry.get("Name") or "").lstrip("/")
    image=entry.get("Config",{}).get("Image")
    state=entry.get("State",{}).get("Status")
    health=(entry.get("State",{}).get("Health",{}) or {}).get("Status")
    ports=[]
    for port, bindings in (entry.get("NetworkSettings",{}) or {}).get("Ports",{}).items():
        if not bindings:
            continue
        for binding in bindings:
            ports.append({
                "containerPort": port,
                "hostPort": binding.get("HostPort"),
                "hostIp": binding.get("HostIp")
            })
    networks_list=list((entry.get("NetworkSettings",{}) or {}).get("Networks",{}).keys())
    mounts=[]
    for mount in entry.get("Mounts",[]) or []:
        source=mount.get("Source") or ""
        name_ref=mount.get("Name") or ""
        host_path=source or volume_mounts.get(name_ref,"")
        mounts.append({
            "type": mount.get("Type"),
            "source": source or name_ref,
            "target": mount.get("Destination"),
            "hostPath": host_path,
            "readOnly": bool(mount.get("RW") is False)
        })
    container={
        "id": entry.get("Id"),
        "name": name,
        "image": image,
        "state": state,
        "health": health,
        "labels": labels,
        "service": labels.get("com.docker.compose.service"),
        "project": labels.get("com.docker.compose.project"),
        "ports": ports,
        "networks": networks_list,
        "mounts": mounts
    }
    container["role"]=infer_role(container["service"] or container["name"], container["image"], labels)
    containers.append(container)

def score_container(container):
    score=0
    if container.get("state")=="running":
        score+=2
    if container.get("health")=="healthy":
        score+=2
    if container.get("service") in canonical_services:
        score+=2
    if container.get("ports"):
        score+=1
    if container.get("mounts"):
        score+=1
    return score

container_clusters={}
for c in containers:
    container_clusters.setdefault(c["role"],[]).append(c)

canonical_by_role={}
duplicate_clusters=[]
for role, items in container_clusters.items():
    if len(items) <= 1:
        if items:
            canonical_by_role[role]=items[0]
        continue
    scored=sorted(items, key=lambda c: (score_container(c), c.get("name","")), reverse=True)
    canonical_by_role[role]=scored[0]
    cluster={
        "role": role,
        "canonical": scored[0].get("name"),
        "members": [{"name": c.get("name"), "service": c.get("service"), "state": c.get("state"), "health": c.get("health"), "score": score_container(c)} for c in scored]
    }
    duplicate_clusters.append(cluster)

service_clusters={}
for svc in services:
    service_clusters.setdefault(svc["role"], []).append(svc)

duplicate_services=[]
for role, items in service_clusters.items():
    if len(items) <= 1:
        continue
    port_sets=[set([p.get("published") for p in item.get("ports",[]) if p.get("published")]) for item in items]
    overlap=False
    for i in range(len(port_sets)):
        for j in range(i+1,len(port_sets)):
            if port_sets[i].intersection(port_sets[j]):
                overlap=True
    duplicate_services.append({
        "role": role,
        "services": [item.get("service") for item in items],
        "overlappingPorts": overlap
    })

allow_stop_running=bool(config.get("allowStopRunning"))
container_allow=set(config.get("containerAllowlist",[]) or [])

remove_containers=[]
quarantine_containers=[]

def mark_container(container, reason):
    if container.get("name") in container_allow or container.get("id") in container_allow:
        return
    if container.get("state")=="running" and not allow_stop_running:
        quarantine_containers.append({"name": container.get("name"), "reason": reason})
        return
    remove_containers.append({
        "id": container.get("id"),
        "name": container.get("name"),
        "state": container.get("state"),
        "reason": reason
    })

for cluster in duplicate_clusters:
    canonical_name=cluster.get("canonical")
    for member in cluster.get("members",[]):
        name=member.get("name")
        if name==canonical_name:
            continue
        container=next((c for c in containers if c.get("name")==name), None)
        if container:
            mark_container(container, "duplicate_role")

for container in containers:
    if container.get("service") and container.get("service") not in canonical_services:
        mark_container(container, "orphan_service")

used_networks=set()
for c in containers:
    for net in c.get("networks",[]):
        used_networks.add(net)
for svc in services:
    for net in svc.get("networks",[]):
        used_networks.add(net)

network_allow=set(config.get("networkAllowlist",[]) or [])
remove_networks=[]
for net in networks:
    name=net.get("Name")
    if not name or name in used_networks or name in network_allow:
        continue
    if name in ("bridge","host","none","ingress"):
        continue
    remove_networks.append({"name": name, "reason": "orphan_network"})

chain_keywords=[k.lower() for k in (config.get("chainDataKeywords",[]) or [])]

def is_chain_data(name, host_path):
    hay=(name or "").lower()+" "+(host_path or "").lower()
    return any(token in hay for token in chain_keywords)

volume_allow=set(config.get("volumeAllowlist",[]) or [])
used_volumes=set()
for c in containers:
    for mount in c.get("mounts",[]):
        source=mount.get("source") or ""
        if source and not source.startswith("/"):
            used_volumes.add(source)

remove_volumes=[]
for vol in volumes:
    name=vol.get("Name")
    if not name or name in used_volumes or name in volume_allow:
        continue
    host_path=volume_mounts.get(name,"")
    if is_chain_data(name, host_path):
        continue
    remove_volumes.append({"name": name, "reason": "orphan_volume"})

used_images=set([c.get("image") for c in containers if c.get("image")])
remove_images=[]
for img in images:
    repo=img.get("Repository")
    tag=img.get("Tag")
    if not repo or repo=="<none>":
        continue
    name=f"{repo}:{tag}" if tag and tag!="<none>" else repo
    if name in used_images:
        continue
    remove_images.append({"name": name, "reason": "unused_image"})

plan={
    "removeContainers": remove_containers,
    "quarantineContainers": quarantine_containers,
    "removeNetworks": remove_networks,
    "removeVolumes": remove_volumes,
    "removeImages": remove_images
}

actions=[]
if apply_flag and docker_ok:
    def apply_cmd(cmd, kind, target):
        result=run(cmd)
        actions.append({
            "command": " ".join(cmd),
            "kind": kind,
            "target": target,
            "status": "success" if result.returncode==0 else "failed",
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip()
        })

    for item in remove_containers:
        cid=item.get("id")
        if not cid:
            continue
        if item.get("state")=="running":
            apply_cmd(["docker","stop",cid],"stop_container",cid)
        apply_cmd(["docker","rm",cid],"remove_container",cid)

    for item in remove_networks:
        name=item.get("name")
        if name:
            apply_cmd(["docker","network","rm",name],"remove_network",name)

    for item in remove_volumes:
        name=item.get("name")
        if name:
            apply_cmd(["docker","volume","rm",name],"remove_volume",name)

    for item in remove_images:
        name=item.get("name")
        if name:
            apply_cmd(["docker","image","rm",name],"remove_image",name)

timestamp=datetime.datetime.utcnow().isoformat()+"Z"
zero_duplicates=not duplicate_clusters and not duplicate_services and not remove_containers

snapshot_label=snapshot_dir or "none"
report={
    "timestamp": timestamp,
    "mode": mode,
    "snapshot": snapshot_label,
    "dockerAvailable": docker_ok,
    "composeFiles": compose_files,
    "inventory": {
        "services": services,
        "containers": containers,
        "networks": networks,
        "volumes": volumes,
        "images": images
    },
    "duplicates": {
        "containerClusters": duplicate_clusters,
        "serviceClusters": duplicate_services,
        "canonicalByRole": {k: v.get("name") for k,v in canonical_by_role.items()}
    },
    "plan": plan,
    "actions": actions,
    "zeroDuplicateAttestation": zero_duplicates
}

json.dump(report, open(report_json,"w"), indent=2)
json.dump(plan, open(plan_json,"w"), indent=2)

lines=[
    "# GhostChain Cleanup Report",
    f"- Timestamp: {timestamp}",
    f"- Snapshot: {snapshot_label}",
    f"- Mode: {mode}",
    f"- Docker available: {str(docker_ok).lower()}",
    f"- Zero-duplicate attestation: {str(zero_duplicates).lower()}",
    "",
    "## Canonical Service Map",
]

for svc in services:
    ports=", ".join([p.get("published") or p.get("target") for p in svc.get("ports",[]) if (p.get("published") or p.get("target"))]) or "none"
    lines.append(f"- {svc.get('service')} ({svc.get('role')}): ports {ports} ({svc.get('composeFile')})")

lines.extend([
    "",
    "## Port Map Matrix",
])
for c in containers:
    host_ports=", ".join([p.get("hostPort") for p in c.get("ports",[]) if p.get("hostPort")]) or "none"
    lines.append(f"- {c.get('name')}: {host_ports}")

lines.extend([
    "",
    "## Duplicate Clusters",
])
if duplicate_clusters:
    for cluster in duplicate_clusters:
        lines.append(f"- {cluster.get('role')}: canonical {cluster.get('canonical')}, members {', '.join([m.get('name') for m in cluster.get('members',[])])}")
else:
    lines.append("- none")

lines.extend([
    "",
    "## Cleanup Plan",
    f"- remove containers: {len(remove_containers)}",
    f"- quarantine containers: {len(quarantine_containers)}",
    f"- remove networks: {len(remove_networks)}",
    f"- remove volumes: {len(remove_volumes)}",
    f"- remove images: {len(remove_images)}",
])

if actions:
    lines.extend([
        "",
        "## Actions Executed",
    ])
    for action in actions:
        lines.append(f"- {action.get('kind')}: {action.get('target')} ({action.get('status')})")

with open(report_md,"w") as fh:
    fh.write("\n".join(lines))
PY

if [[ "$APPLY" == "true" ]]; then
  if [[ -x "$ROOT_DIR/ops/scripts/verify.sh" ]]; then
    if ! "$ROOT_DIR/ops/scripts/verify.sh" --strict; then
      echo "Health gate failed post-cleanup; rolling back." >&2
      if [[ -x "$ROOT_DIR/ops/scripts/rollback.sh" ]]; then
        "$ROOT_DIR/ops/scripts/rollback.sh" --stop-unknown --health-check "$SNAPSHOT_DIR" || true
      fi
      exit 1
    fi
  fi
fi

if [[ "$DIAGRAMS" == "true" && -x "$ROOT_DIR/ops/scripts/generate-diagrams.sh" ]]; then
  "$ROOT_DIR/ops/scripts/generate-diagrams.sh" --report "$REPORT_JSON"
fi

if [[ "$K8S_BLUEPRINT" == "true" && -x "$ROOT_DIR/ops/scripts/generate-k8s-blueprint.sh" ]]; then
  "$ROOT_DIR/ops/scripts/generate-k8s-blueprint.sh" --report "$REPORT_JSON"
fi

echo "Cleanup report: $REPORT_JSON"
echo "Cleanup summary: $REPORT_MD"
