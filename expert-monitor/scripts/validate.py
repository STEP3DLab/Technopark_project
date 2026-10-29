#!/usr/bin/env python3
"""Validate research evidence, dates, money types and safe source URLs.

Expiry is measured against the dataset's declared as-of time, not the machine
clock: an old snapshot remains a valid historical snapshot. The UI computes
current expiry independently and never promotes an unverified signal.
"""
import argparse
import json
import math
import re
from datetime import datetime, time, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit

MOSCOW = timezone(timedelta(hours=3))
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?$")
STATUSES = {"open_confirmed", "needs_review", "historical", "closed"}
AMOUNT_TYPES = {"expert_fee", "claim", "contract", "not_published"}


def parse_timestamp(value, end_of_day=False):
    if not isinstance(value, str) or not DATE.fullmatch(value):
        return None
    try:
        if len(value) == 10:
            day = datetime.strptime(value, "%Y-%m-%d").date()
            return datetime.combine(day, time(23, 59, 59) if end_of_day else time.min, MOSCOW)
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result if result.tzinfo else result.replace(tzinfo=MOSCOW)
    except ValueError:
        return None


def public_url(value):
    if not isinstance(value, str) or not value or re.search(r"[\s\x00-\x1f]", value):
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme in {"https", "http"} and bool(parsed.hostname) and not parsed.username and not parsed.password and (parsed.port is None or 0 < parsed.port < 65536)
    except ValueError:
        return False


def valid_id(value):
    return isinstance(value, str) and 0 < len(value) <= 200 and value not in {"__proto__", "constructor", "prototype"}


def validate(data):
    errors = []
    if not isinstance(data, dict):
        return ["Registry must be an object"]
    meta = data.get("meta", {})
    asof = parse_timestamp(meta.get("asOf")) if isinstance(meta, dict) else None
    if asof is None:
        errors.append("Invalid or missing meta.asOf")
    courts, records = data.get("courts"), data.get("opportunities")
    if not isinstance(courts, list) or not isinstance(records, list):
        return errors + ["courts and opportunities must be arrays"]
    court_ids, record_ids = set(), set()
    for index, c in enumerate(courts):
        if not isinstance(c, dict):
            errors.append(f"Invalid court at index {index}")
            continue
        cid = c.get("id")
        if not valid_id(cid):
            errors.append(f"Invalid court ID at index {index}")
        elif cid in court_ids:
            errors.append(f"Duplicate court IDs: {cid}")
        else:
            court_ids.add(cid)
        for key in ("website", "caseSearchUrl", "contactUrl"):
            if (key == "website" or c.get(key)) and not public_url(c.get(key)):
                errors.append(f"Invalid court URL {cid}: {key}")
    for index, o in enumerate(records):
        if not isinstance(o, dict):
            errors.append(f"Invalid opportunity at index {index}")
            continue
        name = o.get("id")
        if not valid_id(name):
            errors.append(f"Invalid opportunity ID at index {index}")
        elif name in record_ids:
            errors.append(f"Duplicate opportunity IDs: {name}")
        else:
            record_ids.add(name)
        cid = o.get("courtId")
        if cid and (not isinstance(cid, str) or cid not in court_ids):
            errors.append(f"Unknown court: {name}")
        if not isinstance(o.get("status"), str) or o["status"] not in STATUSES:
            errors.append(f"Unknown status: {name}")
        if not isinstance(o.get("amountType"), str) or o["amountType"] not in AMOUNT_TYPES:
            errors.append(f"Unknown amount type: {name}")
        for key in ("amountRub", "proposalRub"):
            value = o.get(key)
            if value is not None and (not isinstance(value, (float, int)) or isinstance(value, bool) or not math.isfinite(value) or value < 0):
                errors.append(f"Invalid amount: {name} {key}")
        if o.get("amountRub") is not None and o.get("amountType") == "not_published":
            errors.append(f"Undisclosed price has value: {name}")
        for key in ("sourceUrl", "documentUrl", "openEvidenceUrl"):
            if (key == "sourceUrl" or o.get(key)) and not public_url(o.get(key)):
                errors.append(f"Invalid or missing source: {name} {key}")
        additional = o.get("additionalSources", [])
        if not isinstance(additional, list) or any(not public_url(v) for v in additional):
            errors.append(f"Invalid additional sources: {name}")
        dates = {}
        for key in ("publishedAt", "checkedAt", "deadline", "hearingAt", "openVerifiedAt"):
            if o.get(key):
                dates[key] = parse_timestamp(o[key], end_of_day=key == "deadline")
                if dates[key] is None:
                    errors.append(f"Invalid date: {name} {key}")
        if asof and dates.get("publishedAt") and dates["publishedAt"].astimezone(MOSCOW).date() > asof.astimezone(MOSCOW).date():
            errors.append(f"Future source at as-of date: {name}")
        if o.get("status") == "open_confirmed":
            if not dates.get("openVerifiedAt") or not public_url(o.get("openEvidenceUrl")):
                errors.append(f"Open claim lacks direct evidence: {name}")
            if asof and dates.get("deadline") and dates["deadline"] < asof:
                errors.append(f"Open but expired: {name}")
            if o.get("sourceType") == "procurement_adjacent":
                errors.append(f"Adjacent tender cannot count as open judicial expertise: {name}")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    data = json.loads((parser.parse_args().data_dir / "registry.json").read_text(encoding="utf-8"))
    errors = validate(data)
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Validated {len(data['courts'])} courts and {len(data['opportunities'])} research records")
