from __future__ import annotations


def render_hypervisor_rules(l1_bridge: str = "br-l1", l2_bridge: str = "br-l2", l3_bridge: str = "br-l3") -> str:
    return f"""
table inet ghostnetsync {{
  chain forward {{
    type filter hook forward priority 0; policy drop;
    ct state established,related accept
    iifname \"{l3_bridge}\" oifname \"{l2_bridge}\" accept
    iifname \"{l2_bridge}\" oifname \"{l1_bridge}\" accept
    iifname \"{l3_bridge}\" oifname != \"{l2_bridge}\" drop
    iifname \"{l2_bridge}\" oifname != \"{l1_bridge}\" drop
    iifname \"{l1_bridge}\" accept
  }}
}}
""".strip()
