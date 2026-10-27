"""Meaningful boundaries: candidates != orders; blocked != available; CSV safety."""
import importlib.util
from pathlib import Path
import unittest

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

    def test_unverified_open_is_rejected(self):
        data = {"meta":{"asOf":"2026-10-27"},"courts":[],"opportunities":[{"id":"x","title":"x","status":"open_confirmed","sourceUrl":"https://example.org/","amountType":"not_published","deadline":"2026-10-25"}]}
        errors = validator.validate(data)
        self.assertTrue(any("lacks direct evidence" in e for e in errors))
        self.assertTrue(any("expired" in e for e in errors))

    def test_prices_and_csv_injection(self):
        self.assertEqual(database.csv_safe("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        self.assertIsNone(database.csv_safe(None))
        self.assertEqual(database.csv_safe(19100000), 19100000)

if __name__ == "__main__": unittest.main()
