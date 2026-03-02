# ghost-web VM — Creation & Setup Guide

This document walks through creating the `ghost-web` KVM VM from scratch on the GhostStack hypervisor.

The VM runs **Traefik v3.1 + Next.js web app** inside Docker, handles **TLS termination** via Let's Encrypt, and serves all public `*.ghostchain.cloud` subdomains.

---

## Architecture

```
Internet (80/443)
      │
      ▼
Hypervisor eth0  ──── nftables DNAT ────► virbr99 (gs-mgmt)
                                               │
                                         10.50.99.10 (ghost-web)
                                               │
                                         ┌─────┴──────┐
                                         │  Traefik   │  (80/443, Let's Encrypt)
                                         │  Next.js   │  (127.0.0.1:3000)
                                         └────────────┘
```

The chain VMs (L1/L2/L3) are **not reachable** from `ghost-web` — the web app talks to the public API (`api.ghostchain.cloud`) for all blockchain queries.

---

## Step 1 — Download Ubuntu Cloud Image

```bash
cd /var/lib/libvirt/images
curl -LO https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
```

---

## Step 2 — Create VM Disk

```bash
qemu-img create -f qcow2 -F qcow2 \
  -b /var/lib/libvirt/images/noble-server-cloudimg-amd64.img \
  /var/lib/libvirt/images/ghost-web.qcow2 \
  40G
```

---

## Step 3 — Edit cloud-init User-Data

Before building the cloud-init ISO, open and fill in real secrets:

```bash
cp infra/hypervisor/cloud-init/ghost-web.yaml /tmp/ghost-web-userdata.yaml
$EDITOR /tmp/ghost-web-userdata.yaml
```

**Required changes:**
- Replace `ssh_authorized_keys` value with your actual `~/.ssh/id_ed25519.pub`
- The env file at `/etc/ghostl-stack/web.env` has `CHANGE_ME` placeholders; update them post-boot (see Step 7)

---

## Step 4 — Build cloud-init ISO

```bash
apt-get install -y cloud-image-utils   # if not already installed
cloud-localds /var/lib/libvirt/images/ghost-web-cloud-init.iso \
  /tmp/ghost-web-userdata.yaml
```

---

## Step 5 — Reserve Static DHCP Lease

Give the VM a predictable IP (`10.50.99.10`) on the `gs-mgmt` network.  
Get the VM's MAC address after creation (Step 6), then:

```bash
# After creating the VM, get its MAC:
virsh dumpxml ghost-web | grep 'mac address'
# Example output: <mac address='52:54:00:ab:cd:ef'/>

# Reserve the IP:
virsh net-update gs-mgmt add ip-dhcp-host \
  "<host mac='52:54:00:ab:cd:ef' name='ghost-web' ip='10.50.99.10'/>" \
  --live --config

# Verify:
virsh net-dumpxml gs-mgmt | grep ghost-web
```

---

## Step 6 — Create the VM

```bash
virt-install \
  --name ghost-web \
  --ram 4096 \
  --vcpus 2 \
  --os-variant ubuntu24.04 \
  --disk path=/var/lib/libvirt/images/ghost-web.qcow2,format=qcow2 \
  --disk path=/var/lib/libvirt/images/ghost-web-cloud-init.iso,device=cdrom \
  --network network=gs-mgmt,model=virtio \
  --graphics none \
  --console pty,target_type=serial \
  --noautoconsole \
  --import
```

> **Note:** `--import` skips the installer and boots directly from the cloud image.  
> The `--noautoconsole` flag returns the shell immediately; cloud-init runs in the background.

---

## Step 7 — Wait for Provisioning & Fill Secrets

```bash
# Monitor cloud-init progress (may take 2-5 minutes):
virsh console ghost-web
# Press Ctrl+] to exit the console

# Or SSH once the VM acquires its IP:
ssh ghost@10.50.99.10

# Inside the VM — fill in real secrets:
sudo nano /etc/ghostl-stack/web.env

# Then restart the stack:
sudo systemctl restart ghostweb
```

---

## Step 8 — Verify

```bash
# From the hypervisor:
virsh domstate ghost-web           # should be "running"
virsh domifaddr ghost-web          # should show 10.50.99.10

# HTTP check (bypasses TLS):
curl -svo /dev/null http://10.50.99.10/ 2>&1 | grep '< HTTP'

# From outside (replaces app.ghostchain.cloud DNS with hypervisor's public IP):
curl -H 'Host: status.ghostchain.cloud' https://<HYPERVISOR_PUBLIC_IP>/ -k -I
```

---

## Step 9 — Configure DNS

Point **all** public subdomains to the hypervisor's public IP (A record):

```
ghostchain.cloud.          A  <HYPERVISOR_PUBLIC_IP>
*.ghostchain.cloud.        A  <HYPERVISOR_PUBLIC_IP>
```

With these records in place and Traefik running inside `ghost-web`, Let's Encrypt HTTP-01 challenges will succeed and certificates will be issued automatically.

---

## Updating the Web App

After code changes are merged and the Docker image rebuilt:

```bash
ssh ghost@10.50.99.10 \
  'sudo bash /opt/ghostl-stack/infra/hypervisor/provision/ghost-web-provision.sh'
```

The provision script pulls the latest image, rolls the container, and verifies HTTP.

---

## Removing / Recreating the VM

```bash
virsh destroy ghost-web
virsh undefine ghost-web --remove-all-storage
# Then redo Steps 2–8
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| VM won't start | `virsh list --all` — does `ghost-web` appear? |
| IP not assigned | DHCP reservation in Step 5; `virsh net-dumpxml gs-mgmt` |
| 502 from Traefik | `docker compose -f /opt/ghostl-stack/infra/docker/docker-compose.web.yml logs web` |
| TLS cert not issued | ACME email set? DNS A records pointing to hypervisor? Port 80 forwarded? |
| Env placeholder still set | `sudo cat /etc/ghostl-stack/web.env` — contains `CHANGE_ME`? |
| Traefik log shows acme error | Ensure `GS_EXT_IF` in `ghoststack.env` matches actual interface (`ip -br link`) |
