from __future__ import annotations

import logging
import socket
import time
from pathlib import Path
from typing import Dict

from .bind_manager import BindManager
from .config import GhostDnsConfig, STATIC_RECORDS
from .governance import GovernanceGuard
from .metrics import (
    DNS_AI_ACTIONS_TOTAL,
    DNS_FAILED_QUERIES,
    DNS_QUERIES_TOTAL,
    DNS_RELOAD_COUNT,
    STALE_RECORD_CLEANUP_TOTAL,
)
from .scanners import scan_docker_records, scan_vm_records
from .validators import (
    detect_resolution_loops,
    validate_forward_resolution,
    validate_reverse_lookup,
    validate_zone_records,
)
from .zone_manager import ZoneManager


LOGGER = logging.getLogger("ghostdns-ai")


class GhostDnsController:
    def __init__(self, config: GhostDnsConfig) -> None:
        self.config = config
        self.config.validate()
        self.zone_manager = ZoneManager(config.zone_file, config.backup_dir, config.zone_name)
        self.bind_manager = BindManager(
            named_checkconf=config.named_checkconf,
            named_checkzone=config.named_checkzone,
            zone_name=config.zone_name,
            zone_file=config.zone_file,
            rndc_reload_cmd=config.rndc_reload_cmd,
            systemctl_reload_cmd=config.systemctl_reload_cmd,
        )
        self.governance = GovernanceGuard(
            lock_file=config.governance_lock_file,
            token_file=config.governance_token_file,
            action_log=config.action_log_file,
            production_mode=config.production_mode,
        )

    @staticmethod
    def _resolve_checks(records: Dict[str, str]) -> None:
        for host in records:
            DNS_QUERIES_TOTAL.inc()
            try:
                socket.gethostbyname(host)
            except OSError:
                DNS_FAILED_QUERIES.inc()

    def _build_desired_records(self) -> Dict[str, str]:
        desired = dict(STATIC_RECORDS)
        desired.update(scan_docker_records(self.config.docker_domain_suffix))
        desired.update(scan_vm_records(self.config.vm_domain_suffix))
        return desired

    def _validate_before_apply(self, records: Dict[str, str]) -> None:
        errors = []
        errors.extend(validate_zone_records(records))
        errors.extend(detect_resolution_loops(records))
        errors.extend(validate_reverse_lookup(records))

        if errors:
            raise ValueError(";".join(sorted(set(errors))))

    def run_once(self) -> bool:
        desired_records = self._build_desired_records()
        self._validate_before_apply(desired_records)

        zone = self.zone_manager.load()
        current_records = zone.records

        stale_count = len(set(current_records) - set(desired_records))
        if stale_count > 0:
            STALE_RECORD_CLEANUP_TOTAL.inc(stale_count)

        if desired_records == current_records:
            self._resolve_checks(desired_records)
            return False

        rendered = self.zone_manager.render(zone, desired_records)
        self.governance.assert_change_allowed(rendered)
        self.zone_manager.backup_current()
        self.zone_manager.write_atomic(rendered)

        self.bind_manager.validate()
        self.bind_manager.reload()
        DNS_RELOAD_COUNT.inc()
        DNS_AI_ACTIONS_TOTAL.inc()

        forward_errors = validate_forward_resolution(desired_records)
        if forward_errors:
            raise RuntimeError("forward_resolution_validation_failed:" + ",".join(forward_errors))

        self._resolve_checks(desired_records)
        return True

    def serve_forever(self) -> None:
        while True:
            try:
                changed = self.run_once()
                if changed:
                    LOGGER.info("dns_state_updated")
            except Exception as error:  # noqa: BLE001
                LOGGER.exception("dns_loop_error: %s", error)
            time.sleep(self.config.loop_interval_seconds)
