import unittest

from marketing_change_readiness.data import load_dataset
from marketing_change_readiness.retrieval import deterministic_retriever, scope_matches


class RetrievalTests(unittest.TestCase):
    def test_scope_excludes_other_product_and_plan(self):
        assets, events, _ = load_dataset()
        price = next(event for event in events if event.id == "c_price_pro")
        by_id = {asset.id: asset for asset in assets}
        self.assertTrue(scope_matches(price, by_id["a01"]))
        self.assertFalse(scope_matches(price, by_id["a03"]))
        self.assertFalse(scope_matches(price, by_id["a04"]))

    def test_global_asset_matches_plan_change(self):
        assets, events, _ = load_dataset()
        promotion = next(event for event in events if event.id == "c_promo_pro")
        global_banner = next(asset for asset in assets if asset.id == "a06")
        self.assertTrue(scope_matches(promotion, global_banner))

    def test_deterministic_retriever_matches_all_labels(self):
        assets, events, labels = load_dataset()
        for event in events:
            with self.subTest(event=event.id):
                self.assertEqual(deterministic_retriever(event, assets), labels[event.id])
