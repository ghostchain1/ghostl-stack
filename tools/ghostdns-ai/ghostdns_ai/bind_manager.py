from __future__ import annotations

import shlex
import subprocess
from pathlib import Path


class BindManager:
    def __init__(
        self,
        named_checkconf: str,
        named_checkzone: str,
        zone_name: str,
        zone_file: Path,
        rndc_reload_cmd: str,
        systemctl_reload_cmd: str,
    ) -> None:
        self.named_checkconf = named_checkconf
        self.named_checkzone = named_checkzone
        self.zone_name = zone_name
        self.zone_file = zone_file
        self.rndc_reload_cmd = rndc_reload_cmd
        self.systemctl_reload_cmd = systemctl_reload_cmd

    def validate(self) -> None:
        subprocess.run([self.named_checkconf], check=True, capture_output=True, text=True)
        subprocess.run(
            [self.named_checkzone, self.zone_name, str(self.zone_file)],
            check=True,
            capture_output=True,
            text=True,
        )

    def reload(self) -> None:
        for command in (self.rndc_reload_cmd, self.systemctl_reload_cmd):
            result = subprocess.run(
                shlex.split(command),
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return
        raise RuntimeError("bind_reload_failed")
