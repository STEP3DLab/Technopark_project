#!/usr/bin/env python3
"""Bounded, robots-aware public-source monitor. Never sends mail or calls courts.

Fetched pages are change signals, NOT confirmed opportunities. No CAPTCHA or
authentication bypass is attempted. Candidate links require human verification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

AGENT = "ExpertMonitor/1.0 (public court research; low-frequency link checks)"
MAX_BYTES = 2_000_000
TERMS = re.compile(r"строительн.{0,20}экспертиз|строительно.техническ|запрос.{0,50}эксперт|эксперт.{0,35}организац|обследован.{0,30}(здани|сооружени)", re.I)
CASE = re.compile(r"(?:А|A)\d{1,3}[-–]\d{1,9}/\d{4}|\d{1,2}[-–]\d{1,8}/\d{4}")
CHALLENGE = re.compile(r"подтвердите.{0,40}(человек|робот)|проверка.{0,30}(браузера|безопасности)|access denied|cf-chl-|challenge-platform|captcha-container|recaptcha|доступ ограничен", re.I)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.href, self.label = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.label = []

    def handle_data(self, data):
        if self.href is not None:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append((self.href, " ".join(self.label)))
            self.href, self.label = None, []


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        final = urllib.parse.urlsplit(response.geturl())
        original = urllib.parse.urlsplit(url)
        if final.hostname != original.hostname:
            # Redirects to a different authority require review before collection.
            raise ValueError("Перенаправление на другой домен: требуется ручная проверка")
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Страница превысила лимит 2 МБ")
        encoding = response.headers.get_content_charset() or "utf-8"
        return response.status, raw.decode(encoding, errors="replace"), response.geturl()


def robots_allowed(url, cache):
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    if origin not in cache:
        rp = urllib.robotparser.RobotFileParser()
        try:
            _, body, _ = fetch(origin + "/robots.txt", timeout=10)
            rp.parse(body.splitlines())
            cache[origin] = rp
        except urllib.error.HTTPError as exc:
            cache[origin] = True if exc.code == 404 else False
        except Exception:
            cache[origin] = False
    value = cache[origin]
    return value if isinstance(value, bool) else value.can_fetch(AGENT, url)


def extract_candidates(body, page_url, source_id, timestamp):
    parser = Links()
    parser.feed(body)
    found = []
    for href, label in parser.links:
        if not TERMS.search(label):
            continue
        absolute = urllib.parse.urljoin(page_url, href)
        parts = urllib.parse.urlsplit(absolute)
        if parts.scheme != "https" or parts.hostname != urllib.parse.urlsplit(page_url).hostname:
            continue
        case = CASE.search(label)
        candidate_id = hashlib.sha256(absolute.encode()).hexdigest()[:16]
        found.append({"id": candidate_id, "sourceId": source_id,
                      "title": "Документ по строительной экспертизе — проверить" if case else "Профильная ссылка — проверить",
                      "caseNumber": case.group(0) if case else None,
                      "url": absolute, "detectedAt": timestamp,
                      "status": "needs_review", "reason": "Совпадение ключевых слов в названии ссылки; срок и доступность заказа не подтверждены"})
    return found


def run(data_dir, offline=False):
    registry = read_json(data_dir / "registry.json", {})
    config = read_json(data_dir / "source-config.json", [])
    previous = read_json(data_dir / "monitoring.json", {})
    old = {s["id"]: s for s in previous.get("sources", [])}
    candidates = {c["id"]: c for c in previous.get("newCandidates", [])}
    timestamp = now()
    checks, robot_cache = [], {}
    for source in config:
        row = {"id": source["id"], "name": source["name"], "url": source["url"],
               "status": "manual_required", "checkedAt": None, "httpStatus": None,
               "error": source.get("notes", ""), "lastSuccessAt": old.get(source["id"], {}).get("lastSuccessAt")}
        if not source.get("autoFetch", False):
            checks.append(row)
            continue
        if offline:
            row.update(status="not_checked", error="Сетевой доступ в среде сборки не выполнен; это не результат проверки источника")
            checks.append(row)
            continue
        row["checkedAt"] = timestamp
        try:
            if not robots_allowed(source["url"], robot_cache):
                row.update(status="robots_restricted", error="robots.txt запрещает или не позволяет подтвердить автоматическое чтение")
                checks.append(row)
                continue
            code, body, final_url = fetch(source["url"])
            row["httpStatus"] = code
            if CHALLENGE.search(body):
                row.update(status="blocked", error="Обнаружена защита / проверка браузера. Нужна ручная проверка")
            else:
                digest = hashlib.sha256(body.encode()).hexdigest()
                old_digest = old.get(source["id"], {}).get("contentHash")
                row.update(status="changed" if old_digest and old_digest != digest else "ok",
                           contentHash=digest, lastSuccessAt=timestamp,
                           error="Страница доступна; это не подтверждение полноты поиска дел")
                if source.get("extractLinks", False):
                    for item in extract_candidates(body, final_url, source["id"], timestamp):
                        candidates.setdefault(item["id"], item)
        except urllib.error.HTTPError as exc:
            row.update(httpStatus=exc.code, status="blocked" if exc.code in (401, 403, 429) else "error", error=f"HTTP {exc.code}; автоматический повтор в этом запуске не производится")
        except Exception as exc:
            row.update(status="error", error=str(exc)[:240])
        checks.append(row)
        time.sleep(0.7)
    # Newly detected links do not modify registry.opportunities. Verification is
    # a separate, auditable step; unknown or older records never become 'open'.
    active = [s for s in checks if s["status"] in ("ok", "changed")]
    report = {"lastRunAt": timestamp, "lastSuccessfulSearchAt": previous.get("lastSuccessfulSearchAt"),
              "status": "degraded" if len(active) != len(checks) else "ok",
              "mode": "offline" if offline else "public-source-links",
              "summary": "Проверка источников и обнаружение ссылок. КАД, процессуальные статусы и сроки проверяются отдельно.",
              "sources": checks, "newCandidates": list(candidates.values())[-500:],
              "verifiedRecords": len(registry.get("opportunities", [])),
              "automaticSending": False}
    write_json(data_dir / "monitoring.json", report)
    print(json.dumps({"sources": len(checks), "available": len(active), "candidates": len(candidates), "status": report["status"]}, ensure_ascii=False))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    run(args.data_dir, args.offline)
