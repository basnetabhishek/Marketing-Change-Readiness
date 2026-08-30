import unittest
from decimal import Decimal

from marketing_change_readiness.normalization import extract_values, normalize_change_value


class NormalizationTests(unittest.TestCase):
    def test_price_variants_normalize(self):
        for text in ("$79", "$79.00 monthly", "79 USD", "79 dollars"):
            with self.subTest(text=text):
                self.assertEqual(normalize_change_value(text, "price").amount, Decimal("79"))

    def test_promotion_variants_normalize(self):
        for text in ("25% off", "save 25 percent"):
            with self.subTest(text=text):
                self.assertEqual(normalize_change_value(text, "promotion").amount, Decimal("25"))

    def test_trial_variants_normalize_to_days(self):
        for text in ("30 days", "1 month", "one-month"):
            with self.subTest(text=text):
                self.assertEqual(normalize_change_value(text, "trial").amount, Decimal("30"))

    def test_extracts_multiple_values(self):
        amounts = {value.amount for value in extract_values("Was $79, now $99", "price")}
        self.assertEqual(amounts, {Decimal("79"), Decimal("99")})
