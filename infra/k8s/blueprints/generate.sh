#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/infra/k8s/blueprints"

mkdir -p "$OUT_DIR/statefulsets" "$OUT_DIR/deployments" "$OUT_DIR/services" "$OUT_DIR/configmaps"

compose_files=(
  "$ROOT_DIR/infra/docker/compose/docker-compose.core.yml"
  "$ROOT_DIR/infra/docker/compose/docker-compose.services.yml"
  "$ROOT_DIR/infra/docker/compose/docker-compose.ui.yml"
  "$ROOT_DIR/infra/docker/compose/docker-compose.obs.yml"
  "$ROOT_DIR/infra/docker/compose/docker-compose.ai.yml"
)

for file in "${compose_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    continue
  fi
  services=$(jq -r '.services | keys[]' "$file")
  for svc in $services; do
    stateful=$(jq -r --arg svc "$svc" '.services[$svc].labels["com.ghost.k8s.stateful"] // "false"' "$file")
    role=$(jq -r --arg svc "$svc" '.services[$svc].labels["com.ghost.k8s.role"] // "api"' "$file")
    no_recreate=$(jq -r --arg svc "$svc" '.services[$svc].labels["com.ghost.k8s.no_recreate"] // "false"' "$file")

    jq -n --arg svc "$svc" --arg role "$role" --arg no_recreate "$no_recreate" --argjson stateful $([[ "$stateful" == "true" ]] && echo true || echo false) --arg file "$file" --argjson service "$(jq -c --arg svc "$svc" '.services[$svc]' "$file")" '
      def env_list($env):
        if $env == null then []
        elif ($env|type)=="object" then ($env | to_entries | map({name: .key, value: (.value|tostring)}))
        elif ($env|type)=="array" then
          ($env | map(
            if (type=="string" and (contains("="))) then {name: split("=")[0], value: split("=")[1]}
            else {name: tostring, value: ""}
            end
          ))
        else [] end;

      def parse_port_str($s):
        ($s | split("/") | .[0]) as $p
        | ($p | split(":") ) as $parts
        | ($parts[-1] | tonumber?) as $target
        | {containerPort: ($target // 0), protocol: "TCP"};

      def ports_list($ports):
        if $ports == null then []
        else ($ports | map(
          if (type=="object") then {containerPort: (.target // 0), protocol: ((.protocol // "tcp") | ascii_upcase)}
          else (parse_port_str(tostring))
          end
        )) end;

      def mount_list($vols):
        if $vols == null then []
        else (
          $vols
          | map(
              if (type=="string") then
                (split(":") | {name: .[0], mountPath: (.[1] // "")})
              elif (type=="object") then
                {name: (.source // ""), mountPath: (.target // "")}
              else
                {name: "", mountPath: ""}
              end
            )
          | map(select(.name != "" and .mountPath != ""))
        ) end;

      def claim_templates($svc):
        ($svc.labels["com.ghost.k8s.volume.claim"] // "")
        | split(",") | map(select(length>0))
        | map({
            metadata: {name: .},
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {requests: {storage: "10Gi"}}
            }
          });

      {
        apiVersion: "apps/v1",
        kind: (if $stateful then "StatefulSet" else "Deployment" end),
        metadata: {
          name: $svc,
          labels: {app: $svc, role: $role},
          annotations: {"ghost.source.compose": $file, "ghost.no_recreate": $no_recreate}
        },
        spec: (
          if $stateful then {
            serviceName: $svc,
            replicas: 1,
            podManagementPolicy: "OrderedReady",
            updateStrategy: {type: "OnDelete"},
            selector: {matchLabels: {app: $svc}},
            template: {
              metadata: {labels: {app: $svc, role: $role}},
              spec: {
                containers: [{
                  name: $svc,
                  image: ($service.image // ""),
                  command: ($service.entrypoint // null),
                  args: ($service.command // null),
                  env: env_list($service.environment),
                  ports: ports_list($service.ports),
                  volumeMounts: mount_list($service.volumes)
                }]
              }
            },
            volumeClaimTemplates: claim_templates($service)
          } else {
            replicas: 1,
            selector: {matchLabels: {app: $svc}},
            template: {
              metadata: {labels: {app: $svc, role: $role}},
              spec: {
                containers: [{
                  name: $svc,
                  image: ($service.image // ""),
                  command: ($service.entrypoint // null),
                  args: ($service.command // null),
                  env: env_list($service.environment),
                  ports: ports_list($service.ports),
                  volumeMounts: mount_list($service.volumes)
                }]
              }
            }
          } end
        )
      }
    ' > "$OUT_DIR/$( [[ "$stateful" == "true" ]] && echo statefulsets || echo deployments )/${svc}.yaml"

    # Service manifest for exposed ports
    ports_count=$(jq -r --arg svc "$svc" '(.services[$svc].ports // []) | length' "$file")
    if [[ "$ports_count" -gt 0 ]]; then
      svc_type=$(jq -r --arg svc "$svc" '.services[$svc].labels["com.ghost.k8s.service.type"] // "ClusterIP"' "$file")
      jq -n --arg svc "$svc" --arg svc_type "$svc_type" --argjson service "$(jq -c --arg svc "$svc" '.services[$svc]' "$file")" '
        def parse_port_str($s):
          ($s | split("/") | .[0]) as $p
          | ($p | split(":") ) as $parts
          | {port: ($parts[0] | tonumber?), targetPort: ($parts[-1] | tonumber?), protocol: "TCP"};

        def ports_list($ports):
          if $ports == null then []
          else ($ports | map(
            if (type=="object") then {port: (.published // .target // 0), targetPort: (.target // 0), protocol: ((.protocol // "tcp") | ascii_upcase)}
            else (parse_port_str(tostring))
            end
          )) end;
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {name: $svc, labels: {app: $svc}},
          spec: {
            type: $svc_type,
            selector: {app: $svc},
            ports: ports_list($service.ports)
          }
        }
      ' > "$OUT_DIR/services/${svc}.yaml"
    fi
  done
done

