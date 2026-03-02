#!/usr/sbin/nft -f
# ==============================================================================
# GhostStack nftables Routing Law
# Template variables (replaced by ghoststack_bootstrap.sh):
#   {{L1_CIDR}} {{L2_CIDR}} {{L3_CIDR}} {{MGMT_CIDR}}
#   {{PROMETHEUS_PORT}} {{GRAFANA_PORT}} {{SUPERVISOR_PORT}}
#   {{WEB_VM_IP}}  — ghost-web VM static IP on gs-mgmt (e.g. 10.50.99.10)
#   {{EXT_IF}}     — hypervisor external NIC facing the internet (e.g. eth0)
#
# Routing law (from AGENTS.md):
#   L3 → L2  ✅ allowed
#   L2 → L1  ✅ allowed
#   L3 → L1  ❌ dropped (non-negotiable)
# ==============================================================================

flush ruleset

define L1_NET  = {{L1_CIDR}}
define L2_NET  = {{L2_CIDR}}
define L3_NET  = {{L3_CIDR}}
define MGMT    = {{MGMT_CIDR}}
define WEB_IP  = {{WEB_VM_IP}}

table inet ghoststack {

  # ──────────────────────────────────────────────────────
  # INPUT — protect the hypervisor host itself
  # ──────────────────────────────────────────────────────
  chain input {
    type filter hook input priority filter;
    policy drop;

    # Loopback
    iif "lo" accept

    # Established connections
    ct state established,related accept

    # ICMP (ping)
    ip protocol icmp accept
    ip6 nexthdr icmpv6 accept

    # SSH — management subnet only
    ip saddr $MGMT tcp dport 22 accept

    # Observability — management subnet only
    ip saddr $MGMT tcp dport {
      {{PROMETHEUS_PORT}},
      {{GRAFANA_PORT}},
      {{SUPERVISOR_PORT}}
    } accept

    # libvirt bridge traffic (VM↔hypervisor services, DHCP, DNS)
    iif { "virbr10", "virbr20", "virbr30", "virbr99" } accept

    # Default: drop
  }

  # ──────────────────────────────────────────────────────
  # FORWARD — inter-VM / inter-layer routing policy
  # ──────────────────────────────────────────────────────
  chain forward {
    type filter hook forward priority filter;
    policy drop;

    # Established / related (return traffic)
    ct state established,related accept

    # Management subnet → any internal (admin access)
    ip saddr $MGMT ip daddr { $L1_NET, $L2_NET, $L3_NET } accept

    # ★ ROUTING LAW ★
    # L3 → L2  (permitted)
    ip saddr $L3_NET ip daddr $L2_NET accept

    # L2 → L1  (permitted)
    ip saddr $L2_NET ip daddr $L1_NET accept

    # L3 → L1  (FORBIDDEN — non-negotiable)
    ip saddr $L3_NET ip daddr $L1_NET drop

    # Intra-layer (within same subnet)
    ip saddr $L1_NET ip daddr $L1_NET accept
    ip saddr $L2_NET ip daddr $L2_NET accept
    ip saddr $L3_NET ip daddr $L3_NET accept

    # ── Web VM (ghost-web on gs-mgmt) ──────────────────────────
    # Public internet → web VM on HTTP/HTTPS (post-DNAT, daddr is already $WEB_IP)
    iif "{{EXT_IF}}" ip daddr $WEB_IP tcp dport { 80, 443 } accept

    # Web VM egress → internet (ACME cert challenges, package updates, etc.)
    ip saddr $WEB_IP oif "{{EXT_IF}}" accept

    # Default: drop
  }

  # ──────────────────────────────────────────────────────
  # OUTPUT — hypervisor host egress
  # ──────────────────────────────────────────────────────
  chain output {
    type filter hook output priority filter;
    policy accept;
  }
}

# ==============================================================================
# NAT — DNAT inbound HTTP/HTTPS to ghost-web VM + MASQUERADE egress
# ==============================================================================
table ip ghoststack_nat {

  # Redirect public HTTP/HTTPS to ghost-web VM before routing decision
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    iif "{{EXT_IF}}" tcp dport { 80, 443 } dnat to {{WEB_VM_IP}}
  }

  # Masquerade gs-mgmt egress so web VM packets reach the internet
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    ip saddr {{MGMT_CIDR}} oif "{{EXT_IF}}" masquerade
  }
}
