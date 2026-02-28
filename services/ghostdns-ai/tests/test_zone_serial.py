from datetime import datetime, timezone

from src.zone_manager import bump_serial, parse_serial


def test_bump_serial_same_day_increments_suffix() -> None:
    now = datetime(2026, 2, 25, 1, 2, 3, tzinfo=timezone.utc)
    assert bump_serial(2026022501, now=now) == 2026022502


def test_bump_serial_new_day_resets_suffix() -> None:
    now = datetime(2026, 2, 25, 1, 2, 3, tzinfo=timezone.utc)
    assert bump_serial(2026022409, now=now) == 2026022501


def test_parse_serial_from_template() -> None:
    zone = "2026022501 ; serial"
    assert parse_serial(zone) == 2026022501
