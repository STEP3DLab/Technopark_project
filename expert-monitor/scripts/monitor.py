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
CHALLENGE = re.compile(r"подтвердите.{0,50}(человек|робот)|провер(?:ка|яем).{0,35}(браузер|безопасност)|вы не робот|доступ ограничен|access denied|checking your browser|verify (?:that )?you are human|just a moment|unusual traffic|automated requests", re.I)
IGNORED_CONTENT = {"script", "style", "template", "iframe", "object", "svg", "noscript"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
GENERIC_LINK = re.compile(r"^(?:судебные?\s+)?(?:экспертные? организации|экспертные? учреждения|строительно[\s-]техническая экспертиза|информация для экспертов|сведения об экспертных организациях)[.! ]*$", re.I)


def hidden(attrs):
    values = dict(attrs)
    return "hidden" in values or str(values.get("aria-hidden") or "").lower() == "true" or bool(re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", str(values.get("style") or ""), re.I))


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.href, self.label = [], None, []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        suppressed = (self.stack[-1][1] if self.stack else False) or tag in IGNORED_CONTENT | {"nav", "footer", "aside", "head"} or values.get("role") in ("navigation", "menu") or hidden(attrs)
        if tag not in VOID_TAGS:
            self.stack.append((tag, suppressed))
        if tag == "a" and not suppressed:
            self.href = dict(attrs).get("href")
            self.label = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.href is not None and not (self.stack and self.stack[-1][1]):
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append((self.href, " ".join(self.label)))
            self.href, self.label = None, []
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


class PageText(HTMLParser):
    """Visible text for challenge detection; a CAPTCHA script alone is not a block."""
    def __init__(self):
        super().__init__()
        self.stack, self.text, self.title = [], [], []

    def handle_starttag(self, tag, attrs):
        suppressed = (self.stack[-1][1] if self.stack else False) or tag in IGNORED_CONTENT or hidden(attrs)
        if tag not in VOID_TAGS:
            self.stack.append((tag, suppressed))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, value):
        if not (self.stack and self.stack[-1][1]):
            self.text.append(value)
            if any(tag == "title" for tag, _ in self.stack):
                self.title.append(value)


def page_state(body):
    parser = PageText()
    parser.feed(body)
    visible = " ".join(" ".join(parser.text).split())
    title = " ".join(parser.title)
    if CHALLENGE.search(title) or CHALLENGE.search(visible[:1600]):
        return "blocked"
    # Strong challenge markup with no meaningful page content also means the
    # requested page was not retrieved. Never solve or circumvent the challenge.
    if len(visible) < 400 and re.search(r"cf-chl-|challenge-platform|id=[\"'](?:captcha-container|challenge-running)", body, re.I):
        return "blocked"
    if len(visible) < 30:
        return "manual_required"
    return "ok"


def canonical_candidate_url(href, page_url):
    if not isinstance(href, str) or not href.strip() or href.lstrip().startswith("#"):
        return None
    absolute = urllib.parse.urljoin(page_url, href.strip())
    try:
        parts = urllib.parse.urlsplit(absolute)
        origin = urllib.parse.urlsplit(page_url)
        if parts.scheme != "https" or parts.hostname != origin.hostname or parts.username or parts.password or parts.port not in (None, 443):
            return None
    except ValueError:
        return None
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    query = [(key, value) for key, value in query if not key.lower().startswith("utm_") and key.lower() not in {"gclid", "fbclid", "yclid"}]
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path or "/", urllib.parse.urlencode(query), ""))


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


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        before, after = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if (before.scheme, before.hostname, before.port) != (after.scheme, after.hostname, after.port):
            raise ValueError("Перенаправление на другой источник: требуется ручная проверка")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9"})
    opener = urllib.request.build_opener(SameOriginRedirect())
    with opener.open(req, timeout=timeout) as response:
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
            if re.search(r"<(?:!doctype\s+html|html|body)(?:\s|>)", body, re.I) or CHALLENGE.search(body):
                cache[origin] = False
            else:
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
    found, seen = [], set()
    for href, label in parser.links:
        label = " ".join(label.split())
        if not TERMS.search(label) or GENERIC_LINK.fullmatch(label):
            continue
        absolute = canonical_candidate_url(href, page_url)
        if not absolute or absolute in seen:
            continue
        seen.add(absolute)
        case = CASE.search(label)
        candidate_id = hashlib.sha256(absolute.encode()).hexdigest()[:16]
        found.append({"id": candidate_id, "sourceId": source_id,
                      "title": label[:500],
                      "caseNumber": case.group(0) if case else None,
                      "url": absolute, "detectedAt": timestamp, "lastSeenAt": timestamp,
                      "status": "needs_review", "reason": "Совпадение ключевых слов в названии ссылки; срок и доступность заказа не подтверждены"})
    return found


def run(data_dir, offline=False):
    registry = read_json(data_dir / "registry.json", {})
    config = read_json(data_dir / "source-config.json", [])
    previous = read_json(data_dir / "monitoring.json", {})
    old = {s["id"]: s for s in previous.get("sources", [])}
    candidates = {c["id"]: c for c in previous.get("newCandidates", [])}
    known_urls = {canonical_candidate_url(c.get("url"), c.get("url", "")): c["id"] for c in candidates.values() if c.get("url")}
    timestamp = now()
    checks, robot_cache = [], {}
    for source in config:
        prior = old.get(source["id"], {})
        row = {"id": source["id"], "name": source["name"], "url": source["url"],
               "automatic": bool(source.get("autoFetch")), "type": source.get("type", ""),
               "status": "manual_required", "checkedAt": None, "httpStatus": None,
               "error": "", "resultMessage": source.get("notes", ""), "lastSuccessAt": prior.get("lastSuccessAt")}
        for key in ("contentHash", "lastLinkScanAt", "lastCandidateCount"):
            if key in prior:
                row[key] = prior[key]
        if not source.get("autoFetch", False):
            checks.append(row)
            continue
        if offline:
            row.update(status="not_checked", resultMessage="Сетевой доступ в среде сборки не выполнен; это не результат проверки источника")
            checks.append(row)
            continue
        row["checkedAt"] = timestamp
        try:
            if not robots_allowed(source["url"], robot_cache):
                row.update(status="robots_restricted", resultMessage="", error="robots.txt запрещает или не позволяет подтвердить автоматическое чтение")
                checks.append(row)
                continue
            code, body, final_url = fetch(source["url"])
            row["httpStatus"] = code
            result = page_state(body)
            if result == "blocked":
                row.update(status="blocked", resultMessage="", error="Обнаружена защита / проверка браузера. Нужна ручная проверка")
            elif result == "manual_required":
                row.update(status="manual_required", resultMessage="Получена пустая страница или оболочка JavaScript. Содержимое источника не проверено")
            else:
                digest = hashlib.sha256(body.encode()).hexdigest()
                old_digest = prior.get("contentHash")
                row.update(status="changed" if old_digest and old_digest != digest else "ok",
                           contentHash=digest, lastSuccessAt=timestamp,
                           error="", resultMessage="Страница доступна; это не подтверждение полноты поиска дел")
                if source.get("extractLinks", False):
                    found = extract_candidates(body, final_url, source["id"], timestamp)
                    row.update(lastLinkScanAt=timestamp, lastCandidateCount=len(found))
                    for item in found:
                        existing_id = known_urls.get(item["url"], item["id"])
                        if existing_id in candidates:
                            candidates[existing_id]["lastSeenAt"] = timestamp
                        else:
                            candidates[item["id"]] = item
                            known_urls[item["url"]] = item["id"]
        except urllib.error.HTTPError as exc:
            row.update(httpStatus=exc.code, status="blocked" if exc.code in (401, 403, 429) else "error", resultMessage="", error=f"HTTP {exc.code}; автоматический повтор в этом запуске не производится")
        except Exception as exc:
            row.update(status="error", resultMessage="", error=str(exc)[:240])
        checks.append(row)
        time.sleep(0.7)
    # Newly detected links do not modify registry.opportunities. Verification is
    # a separate, auditable step; unknown or older records never become 'open'.
    automatic = [s for s in checks if s["automatic"]]
    active = [s for s in automatic if s["status"] in ("ok", "changed")]
    status = "not_checked" if offline else "manual_required" if not automatic else "ok" if len(active) == len(automatic) else "degraded"
    report = {"lastRunAt": timestamp, "lastSuccessfulSearchAt": previous.get("lastSuccessfulSearchAt"),
              "status": status,
              "mode": "offline" if offline else "public-source-links",
              "summary": "Проверка источников и обнаружение ссылок. КАД, процессуальные статусы и сроки проверяются отдельно.",
              "sources": checks, "newCandidates": list(candidates.values())[-500:],
              "registryRecords": len(registry.get("opportunities", [])),
              "automaticSources": len(automatic), "successfulSources": len(active), "manualSources": len(checks) - len(automatic),
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
