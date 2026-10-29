"""Meaningful boundaries: candidates != orders; blocked != available; CSV safety."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
monitor, validator, database = module("monitor"), module("validate"), module("database")

class Boundaries(unittest.TestCase):
    def test_links_are_never_confirmed_orders(self):
        html = '<a href="/case/1">Строительно-техническая экспертиза А40-12/2026</a><a href="https://bad.example/a">Запрос экспертам</a>'
        result = monitor.extract_candidates(html, "https://court.example/", "c", "2026-10-27")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["status"], "needs_review")
        self.assertEqual(result[0]["caseNumber"], "А40-12/2026")
        self.assertNotIn("html", result[0])

    def test_hidden_navigation_and_tracking_duplicates_are_not_new_signals(self):
        html = '''<nav><a href="/nav">Строительная экспертиза А40-1/2026</a></nav>
        <script><a href="/script">Запрос экспертной организации</a></script>
        <iframe><a href="/iframe">Запрос экспертной организации</a></iframe>
        <div hidden><a href="/hidden">Запрос экспертной организации</a></div>
        <a href="/directory">Экспертные организации</a>
        <article><a href="/case/1?utm_source=mail#top">Запрос экспертной организации А40-2/2026</a>
        <a href="/case/1#document">Запрос экспертной организации А40-2/2026</a></article>'''
        result = monitor.extract_candidates(html, "https://court.example/", "c", "2026-10-27")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["url"], "https://court.example/case/1")
        self.assertEqual(result[0]["title"], "Запрос экспертной организации А40-2/2026")
        self.assertEqual(result[0]["status"], "needs_review")

    def test_http_200_challenge_is_not_a_success_but_captcha_script_alone_is_not_a_block(self):
        self.assertEqual(monitor.page_state('<title>Just a moment...</title><script src="/challenge-platform/a.js"></script>'), "blocked")
        self.assertEqual(monitor.page_state('<h1>Подтвердите, что вы человек</h1>'), "blocked")
        self.assertEqual(monitor.page_state('<html><div id="root"></div><script src="app.js"></script></html>'), "manual_required")
        self.assertEqual(monitor.page_state('<h1>Арбитражный суд города Москвы</h1><p>Новости суда и актуальные документы</p><script src="https://google.com/recaptcha/api.js"></script>'), "ok")

    def test_cross_origin_redirect_is_rejected_before_fetching_destination(self):
        handler = monitor.SameOriginRedirect()
        request = urllib.request.Request("https://court.example/")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "Found", {}, "https://elsewhere.example/")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "Found", {}, "http://court.example/")

    def test_html_instead_of_robots_does_not_authorize_collection(self):
        with patch.object(monitor, "fetch", return_value=(200, '<html><h1>Проверка браузера</h1></html>', 'https://court.example/robots.txt')):
            self.assertFalse(monitor.robots_allowed("https://court.example/cases", {}))

    def test_unverified_open_is_rejected(self):
        data = {"meta":{"asOf":"2026-10-27"},"courts":[],"opportunities":[{"id":"x","title":"x","status":"open_confirmed","sourceUrl":"https://example.org/","amountType":"not_published","deadline":"2026-10-25"}]}
        errors = validator.validate(data)
        self.assertTrue(any("lacks direct evidence" in e for e in errors))
        self.assertTrue(any("expired" in e for e in errors))

    def test_prices_and_csv_injection(self):
        self.assertEqual(database.csv_safe("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        self.assertIsNone(database.csv_safe(None))
        self.assertEqual(database.csv_safe(19100000), 19100000)

    def test_bad_dates_urls_and_nonfinite_prices_return_validation_errors(self):
        data = {"meta": {"asOf": "2026-10-29"}, "courts": [], "opportunities": [{"id": "x", "title": "x", "status": "needs_review", "sourceUrl": "ftp://example.org/file", "amountType": "contract", "amountRub": float("nan"), "deadline": "2026-02-30"}]}
        errors = validator.validate(data)
        self.assertTrue(any("Invalid amount" in e for e in errors))
        self.assertTrue(any("Invalid date" in e for e in errors))
        self.assertTrue(any("missing source" in e for e in errors))
        self.assertTrue(validator.validate({"meta": {"asOf": "bad"}, "courts": [], "opportunities": []}))
        self.assertTrue(validator.validate({}))
        self.assertTrue(validator.validate(None))

    def test_validator_checks_intraday_expiry_in_moscow_time(self):
        data = {"meta": {"asOf": "2026-10-29T10:00:00+03:00"}, "courts": [], "opportunities": [{"id": "x", "title": "x", "status": "open_confirmed", "sourceUrl": "https://example.org/", "amountType": "not_published", "openEvidenceUrl": "https://example.org/evidence", "openVerifiedAt": "2026-10-29T08:00:00+03:00", "deadline": "2026-10-29T09:00:00"}]}
        self.assertTrue(any("expired" in e for e in validator.validate(data)))
        data["opportunities"][0]["deadline"] = "2026-10-29"
        self.assertFalse(validator.validate(data))


class MonitorHistory(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = [
            {"id": "auto", "name": "Суд", "url": "https://court.example/", "autoFetch": True, "extractLinks": True},
            {"id": "manual", "name": "КАД", "url": "https://manual.example/", "autoFetch": False},
        ]
        (self.root / "registry.json").write_text(json.dumps({"opportunities": [{"id": "historical"}]}))
        (self.root / "source-config.json").write_text(json.dumps(self.config))

    def run_monitor(self, *, body=None, error=None, offline=False):
        with patch.object(monitor, "robots_allowed", return_value=True), patch.object(monitor.time, "sleep"), patch.object(monitor, "fetch", side_effect=error, return_value=(200, body or '<h1>Арбитражный суд Москвы</h1><p>Публичные судебные материалы</p>', 'https://court.example/')):
            return monitor.run(self.root, offline=offline)

    def test_manual_sources_do_not_make_successful_automatic_check_degraded(self):
        report = self.run_monitor()
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["automaticSources"], 1)
        self.assertEqual(report["manualSources"], 1)
        self.assertEqual(report["sources"][0]["error"], "")
        self.assertIsNone(report["lastSuccessfulSearchAt"])
        self.assertEqual(report["registryRecords"], 1)
        self.assertNotIn("verifiedRecords", report)

    def test_failed_attempt_keeps_last_success_hash_and_discovered_candidates(self):
        first = self.run_monitor(body='<h1>Арбитражный суд Москвы</h1><a href="/case/1">Запрос экспертной организации А40-12/2026</a>')
        failed = self.run_monitor(error=urllib.error.HTTPError('https://court.example/', 403, 'Forbidden', {}, None))
        self.assertEqual(failed["status"], "degraded")
        self.assertEqual(failed["sources"][0]["lastSuccessAt"], first["sources"][0]["lastSuccessAt"])
        self.assertEqual(failed["sources"][0]["contentHash"], first["sources"][0]["contentHash"])
        self.assertEqual(failed["newCandidates"], first["newCandidates"])
        self.assertEqual(failed["sources"][0]["status"], "blocked")
        recovered = self.run_monitor()
        self.assertEqual(recovered["sources"][0]["status"], "changed")

    def test_offline_run_never_claims_network_success(self):
        first = self.run_monitor()
        offline = self.run_monitor(offline=True)
        self.assertEqual(offline["status"], "not_checked")
        self.assertEqual(offline["mode"], "offline")
        self.assertIsNone(offline["sources"][0]["checkedAt"])
        self.assertEqual(offline["sources"][0]["lastSuccessAt"], first["sources"][0]["lastSuccessAt"])

    def test_repeated_candidate_retains_first_detection_time_and_id(self):
        body='<h1>Арбитражный суд Москвы</h1><a href="/case/1">Запрос экспертной организации А40-12/2026</a>'
        with patch.object(monitor, "now", return_value="2026-10-28T08:00:00Z"):
            first=self.run_monitor(body=body)
        with patch.object(monitor, "now", return_value="2026-10-29T08:00:00Z"):
            repeated=self.run_monitor(body=body)
        self.assertEqual(len(repeated["newCandidates"]), 1)
        self.assertEqual(repeated["newCandidates"][0]["detectedAt"], first["newCandidates"][0]["detectedAt"])
        self.assertEqual(repeated["newCandidates"][0]["lastSeenAt"], "2026-10-29T08:00:00Z")

if __name__ == "__main__": unittest.main()
