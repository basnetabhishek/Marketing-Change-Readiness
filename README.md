# Marketing Change Readiness

[Change history](CHANGELOG.md)

Marketing teams often leave stale claims behind when a price, promotion, or trial changes. A search for the literal old value misses formatting variants such as `79 dollars`, `25 percent`, or `one month`; broad search also creates noise from other products and plans.

This first working version pairs a deterministic candidate-retrieval core with a minimal interactive dashboard, while deliberately leaving AI verification for the next milestone. It includes a labeled ten-asset corpus, three change events, an exact/keyword baseline, regex-based value normalization, product/plan scoping, and tests.

A lightweight four-view dashboard in `web/` provides an operational overview, evidence-source management, change-event creation, and an evidence-backed review queue. The workspace begins empty: users can fetch a public landing-page URL, upload a text-based marketing file, add an email draft, or paste other campaign copy. Visitors can then model price, promotion, trial, or introductory-APR changes and run the deterministic scan in their browser.

The public URL importer uses a small guarded Vercel function in `api/extract.js`; it accepts public HTML and text pages while rejecting private-network targets, non-web protocols, oversized responses, and excessive redirects. Uploaded files, email drafts, and pasted copy stay in the current browser session and are not persisted. Scheduled monitoring, durable snapshots, and account-level access remain future backend milestones. The former Chase scenario is available only through the optional sample button.

## What the evaluation measures

- **Precision:** how many retrieved assets really need review.
- **Recall:** how many labeled affected assets were found.
- **Candidate count:** the average review queue per change.
- **Manual review reduction:** the share of the corpus excluded from review versus checking every asset.

Metrics are micro-averaged across change events; candidate count and review reduction are event averages. Labels are in `src/marketing_change_readiness/datasets/labels.json`, separate from the retrieval logic.

## Run it

Python 3.10 or newer is required.

```bash
python -m pip install -e .
python -m unittest discover -s tests -v
marketing-readiness-eval
```

For machine-readable results:

```bash
marketing-readiness-eval --json
```

Regenerate the dashboard report after changing the corpus or evaluator:

```bash
marketing-readiness-eval --output web/report.json
```

## Project shape

```text
src/marketing_change_readiness/
  datasets/       labeled assets, changes, and expected matches
  normalization.py  deterministic value parsing
  retrieval.py      baseline, scope rules, deterministic retrieval
  evaluation.py     metrics and comparison runner
tests/             normalization, scoping, retrieval, and metric tests
```

The `Retriever` callable boundary in `retrieval.py` is the intended extension point for embeddings and an LLM verifier. Those are deliberately absent here: the deterministic baseline should remain reproducible, cheap, and independently testable.
