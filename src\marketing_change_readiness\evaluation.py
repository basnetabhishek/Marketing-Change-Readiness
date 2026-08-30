from dataclasses import asdict, dataclass
from statistics import mean

from .data import load_dataset
from .models import Asset, ChangeEvent
from .retrieval import Retriever, deterministic_retriever, exact_keyword_baseline


@dataclass(frozen=True)
class EventMetrics:
    event_id: str
    true_positives: int
    false_positives: int
    false_negatives: int
    candidate_count: int
    precision: float
    recall: float
    manual_review_reduction: float


@dataclass(frozen=True)
class StrategyMetrics:
    strategy: str
    events: tuple[EventMetrics, ...]
    precision: float
    recall: float
    average_candidate_count: float
    manual_review_reduction: float


@dataclass(frozen=True)
class EvaluationReport:
    corpus_size: int
    strategies: tuple[StrategyMetrics, ...]

    def as_dict(self) -> dict:
        return asdict(self)


def _evaluate_strategy(
    name: str,
    retriever: Retriever,
    assets: list[Asset],
    events: list[ChangeEvent],
    labels: dict[str, set[str]],
) -> StrategyMetrics:
    rows: list[EventMetrics] = []
    total_tp = total_fp = total_fn = 0
    for event in events:
        predicted = retriever(event, assets)
        expected = labels[event.id]
        tp, fp, fn = len(predicted & expected), len(predicted - expected), len(expected - predicted)
        total_tp += tp
        total_fp += fp
        total_fn += fn
        rows.append(EventMetrics(
            event_id=event.id,
            true_positives=tp,
            false_positives=fp,
            false_negatives=fn,
            candidate_count=len(predicted),
            precision=tp / (tp + fp) if tp + fp else 0.0,
            recall=tp / (tp + fn) if tp + fn else 0.0,
            manual_review_reduction=1 - (len(predicted) / len(assets)),
        ))
    return StrategyMetrics(
        strategy=name,
        events=tuple(rows),
        precision=total_tp / (total_tp + total_fp) if total_tp + total_fp else 0.0,
        recall=total_tp / (total_tp + total_fn) if total_tp + total_fn else 0.0,
        average_candidate_count=mean(row.candidate_count for row in rows),
        manual_review_reduction=mean(row.manual_review_reduction for row in rows),
    )


def evaluate_dataset() -> EvaluationReport:
    assets, events, labels = load_dataset()
    strategies = (
        _evaluate_strategy("exact_keyword", exact_keyword_baseline, assets, events, labels),
        _evaluate_strategy("deterministic_scoped", deterministic_retriever, assets, events, labels),
    )
    return EvaluationReport(corpus_size=len(assets), strategies=strategies)

