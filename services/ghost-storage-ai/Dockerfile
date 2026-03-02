# SPDX-License-Identifier: UNLICENSED
# ghost-storage-ai — AI-driven hypervisor storage manager
# Runs on the hypervisor host (host-network mode) or via libvirt socket mount.
FROM python:3.12-slim AS base

WORKDIR /app

# System dependencies: openssh-client (SSH to VMs), qemu-utils (qemu-img),
# libvirt-clients (virsh pool-info / domblklist queries)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssh-client \
        qemu-utils \
        libvirt-clients \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY core/ ./core/
COPY ghoststorage.py .
COPY config/ ./config/

# Runtime dirs
RUN mkdir -p state plans evidence

ENV GSA_APPLY_ENABLED=false \
    GSA_RECONCILE_INTERVAL_SECONDS=300 \
    GSA_PORT=7630 \
    GSA_SSH_USER=ghost \
    GSA_SSH_KEY=/run/secrets/ghost_storage_ssh_key

EXPOSE 7630

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://localhost:7630/health',timeout=4)" || exit 1

ENTRYPOINT ["python", "ghoststorage.py"]
CMD ["daemon"]
