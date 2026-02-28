from __future__ import annotations

import logging

from .config import GhostDnsConfig
from .controller import GhostDnsController
from .metrics import start_metrics_server


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    config = GhostDnsConfig()
    start_metrics_server(config.metrics_host, config.metrics_port)
    controller = GhostDnsController(config)
    controller.serve_forever()


if __name__ == "__main__":
    main()
