import argparse
import json
from pathlib import Path

from .evaluation import evaluate_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate marketing change candidate retrieval")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    parser.add_argument("--output", type=Path, help="Write the JSON report to a file")
    args = parser.parse_args()
    report = evaluate_dataset()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report.as_dict(), indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")
        return
    if args.json:
        print(json.dumps(report.as_dict(), indent=2))
        return
    print(f"Corpus: {report.corpus_size} assets")
    print("strategy                 precision  recall  avg candidates  review reduction")
    for result in report.strategies:
        print(
            f"{result.strategy:<24} {result.precision:>9.1%}  {result.recall:>6.1%}"
            f"  {result.average_candidate_count:>14.2f}  {result.manual_review_reduction:>16.1%}"
        )


if __name__ == "__main__":
    main()
