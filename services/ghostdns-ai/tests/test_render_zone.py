from src.zone_manager import render_zone


def test_render_zone_stable_sorting_and_records() -> None:
    template = "2026022501 ; serial"
    records = {
        "l2.ghostchain.cloud": ("192.168.122.205", 300),
        "l1.ghostchain.cloud": ("192.168.122.205", 300),
    }
    state = render_zone("ghostchain.cloud", template, records)
    lines = [line for line in state.rendered.splitlines() if " IN A " in line]
    assert lines[0].strip().startswith("l1")
    assert lines[1].strip().startswith("l2")
