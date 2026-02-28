from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class BindTemplateContext:
    recursion_cidrs: str
    upstream_dns: str
    bind_listen_ipv4: str
    zone_dir: str


def render_template(path: Path, context: BindTemplateContext) -> str:
    content = path.read_text(encoding="utf-8")
    return (
        content.replace("{{RECURSION_CIDRS}}", context.recursion_cidrs)
        .replace("{{UPSTREAM_DNS}}", context.upstream_dns)
        .replace("{{BIND_LISTEN_IPV4}}", context.bind_listen_ipv4)
        .replace("{{ZONE_DIR}}", context.zone_dir)
    )


def render_bind_files(config_dir: Path, out_dir: Path, context: BindTemplateContext) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        "named.conf.options.template": out_dir / "named.conf.options",
        "named.conf.local.template": out_dir / "named.conf.local",
    }
    for template_name, output_file in mapping.items():
        output_file.write_text(render_template(config_dir / template_name, context), encoding="utf-8")
