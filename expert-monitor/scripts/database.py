#!/usr/bin/env python3
"""Create a portable SQLite research database and CSVs from the reviewed JSON.
Private proposals are deliberately excluded; the public DB contains sources.
"""
import argparse
import csv
import json
import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE courts (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, region TEXT, website TEXT NOT NULL, case_search_url TEXT, contact_url TEXT, email TEXT, phone TEXT, address TEXT, source_url TEXT, checked_at TEXT, verification TEXT, note TEXT);
CREATE TABLE opportunities (id TEXT PRIMARY KEY, court_id TEXT REFERENCES courts(id), court TEXT, case_number TEXT, title TEXT NOT NULL, category TEXT, region TEXT, source_type TEXT, status TEXT NOT NULL CHECK(status IN ('open_confirmed','needs_review','historical','closed')), published_at TEXT, deadline TEXT, hearing_at TEXT, amount_rub REAL CHECK(amount_rub IS NULL OR amount_rub >= 0), amount_type TEXT CHECK(amount_type IN ('expert_fee','claim','contract','not_published')), proposal_rub REAL CHECK(proposal_rub IS NULL OR proposal_rub >= 0), summary TEXT, decision_summary TEXT, next_action TEXT, source_url TEXT NOT NULL, document_url TEXT, verification TEXT, checked_at TEXT, detail_json TEXT NOT NULL);
CREATE INDEX cases_by_court ON opportunities(court_id, status);
CREATE INDEX cases_by_deadline ON opportunities(deadline);
CREATE TABLE sources (id TEXT PRIMARY KEY, name TEXT, url TEXT NOT NULL, type TEXT, status TEXT, notes TEXT);
"""


def make_db(data_dir):
    data = json.loads((data_dir / "registry.json").read_text(encoding="utf-8"))
    target = data_dir / "registry.sqlite"
    temp = data_dir / "registry.sqlite.tmp"
    temp.unlink(missing_ok=True)
    with sqlite3.connect(temp) as db:
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO metadata VALUES (?,?)", [(k, json.dumps(v, ensure_ascii=False)) for k, v in data["meta"].items()])
        court_fields = ["id","name","kind","region","website","caseSearchUrl","contactUrl","email","phone","address","sourceUrl","checkedAt","verification","note"]
        db.executemany("INSERT INTO courts VALUES (" + ",".join("?" for _ in court_fields) + ")", [[scalar(c.get(k)) for k in court_fields] for c in data["courts"]])
        fields = ["id","courtId","court","caseNumber","title","category","region","sourceType","status","publishedAt","deadline","hearingAt","amountRub","amountType","proposalRub","summary","decisionSummary","nextAction","sourceUrl","documentUrl","verification","checkedAt"]
        db.executemany("INSERT INTO opportunities VALUES (" + ",".join("?" for _ in fields + ["json"]) + ")", [[scalar(o.get(k)) for k in fields] + [json.dumps(o, ensure_ascii=False)] for o in data["opportunities"]])
        db.executemany("INSERT INTO sources VALUES (?,?,?,?,?,?)", [[scalar(s.get(k)) for k in ["id","name","url","type","status","notes"]] for s in data["sources"]])
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    temp.replace(target)
    for name, rows in [("courts", data["courts"]), ("opportunities", data["opportunities"])]:
        fields = list(dict.fromkeys(k for row in rows for k in row))
        with (data_dir / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fields)
            writer.writeheader()
            writer.writerows({k: csv_safe(scalar(row.get(k))) for k in fields} for row in rows)
    print(f"SQLite verified: {len(data['courts'])} courts, {len(data['opportunities'])} records")


def scalar(value):
    return json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value


def csv_safe(value):
    return "'" + value if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")) else value


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    make_db(parser.parse_args().data_dir)
