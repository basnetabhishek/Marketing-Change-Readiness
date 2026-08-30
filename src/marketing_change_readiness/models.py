from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

ChangeKind = Literal["price", "promotion", "trial"]


@dataclass(frozen=True)
class Asset:
    id: str
    title: str
    text: str
    product: str
    plan: str | None = None


@dataclass(frozen=True)
class ChangeEvent:
    id: str
    kind: ChangeKind
    product: str
    plan: str | None
    old_value: str
    new_value: str
    keywords: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class NormalizedValue:
    kind: ChangeKind
    amount: Decimal
    unit: str

