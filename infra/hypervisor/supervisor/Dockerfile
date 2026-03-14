# GhostStack Autonomous Infrastructure Supervisor (GAIS)
# =========================================================
# Runs ghostais.py — the unified VM management + healing + scaling service.
#
# The container needs access to the host's libvirt socket so virsh can manage
# VMs.  Mount it at runtime:
#
#   docker run \
#     -v /var/run/libvirt/libvirt-sock:/var/run/libvirt/libvirt-sock \
#     -e GAIS_API_TOKEN=<secret> \
#     -e GHOSTBRAIN_URL=http://ghostbrain-core:7900 \
#     -p 9100:9100 \
#     ghostchain/gais:latest
#
# OR use the docker-compose.supervisor.yml file at the repo root.

FROM python:3.12-slim

# Install virsh (libvirt-clients) + openssh-client (for SSH soft-restart)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libvirt-clients \
        openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy supervisor source files
COPY auto_scaler.py          .
COPY node_healer.py          .
COPY validator_rebalancer.py .
COPY vm_manager.py           .
COPY ghostais.py             .

# Runtime defaults (all overridable via environment or docker-compose)
ENV GAIS_LISTEN_ADDR=0.0.0.0 \
    GAIS_LISTEN_PORT=9100 \
    GAIS_LOG_LEVEL=INFO \
    SCRAPE_INTERVAL_S=10 \
    HEAL_INTERVAL_S=15 \
    SCALE_INTERVAL_S=180 \
    REBALANCE_INTERVAL_S=360 \
    DIRECTIVE_POLL_S=30 \
    VIRSH_URI=qemu:///system \
    VM_MANAGER_DRY_RUN=0 \
    VM_SNAPSHOT_ENABLED=1

EXPOSE 9100

# Drop privileges after libvirt socket access is verified at container start.
# Note: libvirt socket requires the process to be in the 'libvirt' group on
# the host; map via --group-add or set VIRSH_URI to a remote libvirtd URL.
CMD ["python3", "ghostais.py"]
