import re
from collections.abc import Callable, Iterable

from .models import Asset, ChangeEvent
from .normalization import extract_values, normalize_change_value

Retriever = Callable[[ChangeEvent, Iterable[Asset]], set[str]]


def scope_matches(event: ChangeEvent, asset: Asset) -> bool:
    """Require product equality and, when specified, plan equality or a global asset."""
    if asset.product.casefold() != event.product.casefold():
        return False
    if event.plan is None or asset.plan is None:
        return True
    return asset.plan.casefold() == event.plan.casefold()


def exact_keyword_baseline(event: ChangeEvent, assets: Iterable[Asset]) -> set[str]:
    """Plain text baseline: exact old value or all supplied keyword tokens."""
    old = event.old_value.casefold()
    keywords = tuple(keyword.casefold() for keyword in event.keywords)
    found: set[str] = set()
    for asset in assets:
        text = asset.text.casefold()
        keyword_hit = bool(keywords) and all(re.search(rf"\b{re.escape(k)}\b", text) for k in keywords)
        if old in text or keyword_hit:
            found.add(asset.id)
    return found


def deterministic_retriever(event: ChangeEvent, assets: Iterable[Asset]) -> set[str]:
    """Find old values across formatting variants, constrained to product/plan scope."""
    expected = normalize_change_value(event.old_value, event.kind)
    return {
        asset.id
        for asset in assets
        if scope_matches(event, asset) and expected in extract_values(asset.text, event.kind)
    }

