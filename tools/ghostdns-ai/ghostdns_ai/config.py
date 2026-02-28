from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


@dataclass(slots=True)
class GhostDnsConfig:
    zone_name: str = os.getenv("GHOSTDNS_ZONE_NAME", "ghostchain.cloud")
    zone_file: Path = Path(os.getenv("GHOSTDNS_ZONE_FILE", "/etc/bind/zones/db.ghostchain.cloud"))
    named_checkconf: str = os.getenv("GHOSTDNS_NAMED_CHECKCONF", "named-checkconf")
    named_checkzone: str = os.getenv("GHOSTDNS_NAMED_CHECKZONE", "named-checkzone")
    rndc_reload_cmd: str = os.getenv("GHOSTDNS_RNDC_RELOAD_CMD", "rndc reload")
    systemctl_reload_cmd: str = os.getenv("GHOSTDNS_SYSTEMCTL_RELOAD_CMD", "systemctl reload bind9")
    backup_dir: Path = Path(os.getenv("GHOSTDNS_BACKUP_DIR", "/var/backups/ghostdns"))
    action_log_file: Path = Path(os.getenv("GHOSTDNS_ACTION_LOG", "/var/log/ghostdns-ai-actions.log"))
    governance_lock_file: Path = Path(os.getenv("GHOSTDNS_GOVERNANCE_LOCK", "/home/ghost/ghostl-stack/tools/ghostdns-ai/governance.lock"))
    governance_token_file: Path = Path(os.getenv("GHOSTDNS_GOVERNANCE_TOKEN", "/home/ghost/ghostl-stack/tools/ghostdns-ai/governance.approval.token"))
    production_mode: bool = os.getenv("GHOSTDNS_PRODUCTION_MODE", "1") == "1"
    loop_interval_seconds: int = max(10, int(os.getenv("GHOSTDNS_LOOP_INTERVAL", "60")))
    metrics_host: str = os.getenv("GHOSTDNS_METRICS_HOST", "0.0.0.0")
    metrics_port: int = int(os.getenv("GHOSTDNS_METRICS_PORT", "9831"))
    docker_domain_suffix: str = os.getenv("GHOSTDNS_DOCKER_SUFFIX", "docker.internal.ghostchain.cloud")
    vm_domain_suffix: str = os.getenv("GHOSTDNS_VM_SUFFIX", "vm.internal.ghostchain.cloud")
    trusted_networks: List[str] = field(
        default_factory=lambda: [
            value.strip()
            for value in os.getenv(
                "GHOSTDNS_TRUSTED_NETWORKS",
                "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
            ).split(",")
            if value.strip()
        ]
    )

    def validate(self) -> None:
        for cidr in self.trusted_networks:
            ipaddress.ip_network(cidr)


STATIC_RECORDS: Dict[str, str] = {
    "l1.ghostchain.cloud": os.getenv("GHOSTDNS_L1_IP", "192.168.122.205"),
    "l2.ghostchain.cloud": os.getenv("GHOSTDNS_L2_IP", "192.168.122.205"),
    "l3.ghostchain.cloud": os.getenv("GHOSTDNS_L3_IP", "192.168.122.205"),
    "devnet.ghostchain.cloud": os.getenv("GHOSTDNS_DEVNET_IP", "192.168.122.205"),
    "testnet.ghostchain.cloud": os.getenv("GHOSTDNS_TESTNET_IP", "192.168.122.205"),
    "mainnet.ghostchain.cloud": os.getenv("GHOSTDNS_MAINNET_IP", "192.168.122.205"),
    "hypervisor.ghostchain.cloud": os.getenv("GHOSTDNS_HYPERVISOR_IP", "192.168.122.205"),
    "docker.internal.ghostchain.cloud": os.getenv("GHOSTDNS_DOCKER_INTERNAL_IP", "172.17.0.1"),
}
