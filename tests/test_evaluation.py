import unittest
import json
from pathlib import Path

from marketing_change_readiness.evaluation import evaluate_dataset


class EvaluationTests(unittest.TestCase):
    def test_evaluation_reports_required_metrics(self):
        report = evaluate_dataset()
        deterministic = next(item for item in report.strategies if item.strategy == "deterministic_scoped")
        self.assertEqual(deterministic.precision, 1.0)
        self.assertEqual(deterministic.recall, 1.0)
        self.assertEqual(deterministic.average_candidate_count, 2.0)
        self.assertAlmostEqual(deterministic.manual_review_reduction, 0.8)
        self.assertEqual(len(deterministic.events), 3)

    def test_baseline_is_measurably_weaker(self):
        report = evaluate_dataset()
        baseline = next(item for item in report.strategies if item.strategy == "exact_keyword")
        deterministic = next(item for item in report.strategies if item.strategy == "deterministic_scoped")
        self.assertLess(baseline.precision, deterministic.precision)
        self.assertLess(baseline.recall, deterministic.recall)

    def test_published_report_matches_current_evaluator(self):
        published = json.loads((Path(__file__).parents[1] / "web" / "report.json").read_text(encoding="utf-8"))
        current = json.loads(json.dumps(evaluate_dataset().as_dict()))
        self.assertEqual(published, current)
