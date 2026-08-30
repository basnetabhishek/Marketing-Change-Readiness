import re
from decimal import Decimal

from .models import ChangeKind, NormalizedValue

_PRICE_PATTERNS = (
    re.compile(r"\$\s*(\d+(?:\.\d{1,2})?)"),
    re.compile(r"\b(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b", re.I),
)
_PROMOTION_PATTERNS = (
    re.compile(r"\b(\d+(?:\.\d+)?)\s*%"),
    re.compile(r"\b(\d+(?:\.\d+)?)\s*percent\b", re.I),
)
_NUMBER = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)"
_TRIAL_PATTERNS = tuple(
    re.compile(rf"\b{_NUMBER}\s*[- ]?{unit}s?\b", re.I)
    for unit in ("day", "week", "month")
)
_WRITTEN_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "fourteen": 14, "thirty": 30,
}


def extract_values(text: str, kind: ChangeKind) -> set[NormalizedValue]:
    """Extract comparable values. Trial durations are canonicalized to days."""
    results: set[NormalizedValue] = set()
    if kind == "price":
        for pattern in _PRICE_PATTERNS:
            results.update(NormalizedValue(kind, Decimal(match.group(1)), "usd") for match in pattern.finditer(text))
    elif kind == "promotion":
        for pattern in _PROMOTION_PATTERNS:
            results.update(NormalizedValue(kind, Decimal(match.group(1)), "percent") for match in pattern.finditer(text))
    else:
        multipliers = (Decimal(1), Decimal(7), Decimal(30))
        for pattern, multiplier in zip(_TRIAL_PATTERNS, multipliers):
            results.update(
                NormalizedValue(
                    kind,
                    Decimal(_WRITTEN_NUMBERS.get(match.group(1).casefold(), match.group(1))) * multiplier,
                    "days",
                )
                for match in pattern.finditer(text)
            )
    return results


def normalize_change_value(value: str, kind: ChangeKind) -> NormalizedValue:
    values = extract_values(value, kind)
    if len(values) != 1:
        raise ValueError(f"Expected one {kind} value in {value!r}; found {len(values)}")
    return next(iter(values))
