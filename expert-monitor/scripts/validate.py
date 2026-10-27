#!/usr/bin/env python3
"""Validate the distinctions that matter to commercial research."""
import argparse
import json
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

def validate(data):
    errors = []
    asof = date.fromisoformat(data["meta"]["asOf"][:10])
    court_ids = [c["id"] for c in data["courts"]]
    ids = [o["id"] for o in data["opportunities"]]
    if len(set(court_ids)) != len(court_ids): errors.append("Duplicate court IDs")
    if len(set(ids)) != len(ids): errors.append("Duplicate opportunity IDs")
    for c in data["courts"]:
        if not urlsplit(c["website"]).hostname: errors.append(f"Invalid court URL {c['id']}")
    for o in data["opportunities"]:
        name = o["id"]
        if o.get("courtId") and o["courtId"] not in court_ids: errors.append(f"Unknown court: {name}")
        if o["status"] not in ("open_confirmed", "needs_review", "historical", "closed"): errors.append(f"Unknown status: {name}")
        for k in ("amountRub", "proposalRub"):
            if o.get(k) is not None and (not isinstance(o[k], (float,int)) or isinstance(o[k], bool) or o[k] < 0): errors.append(f"Invalid amount: {name} {k}")
        if o.get("amountRub") is not None and o.get("amountType") == "not_published": errors.append(f"Undisclosed price has value: {name}")
        if not urlsplit(o.get("sourceUrl", "")).hostname: errors.append(f"Missing source: {name}")
        if o.get("publishedAt") and date.fromisoformat(o["publishedAt"][:10]) > asof: errors.append(f"Future source at as-of date: {name}")
        if o["status"] == "open_confirmed":
            if not o.get("openVerifiedAt") or not o.get("openEvidenceUrl"): errors.append(f"Open claim lacks direct evidence: {name}")
            if o.get("deadline") and date.fromisoformat(o["deadline"][:10]) < asof: errors.append(f"Open but expired: {name}")
            if o.get("sourceType") == "procurement_adjacent": errors.append(f"Adjacent tender cannot count as open judicial expertise: {name}")
    return errors

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    data = json.loads((parser.parse_args().data_dir / "registry.json").read_text(encoding="utf-8"))
    errors = validate(data)
    if errors: raise SystemExit("\n".join(errors))
    print(f"Validated {len(data['courts'])} courts and {len(data['opportunities'])} research records")
