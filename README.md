# Marketing Change Readiness

[Change history](CHANGELOG.md)

Marketing teams often leave stale claims behind when a price, promotion, or trial changes. A search for the literal old value misses formatting variants such as `79 dollars`, `25 percent`, or `one month`; broad search also creates noise from other products and plans.

The project pairs a deterministic candidate-retrieval core with an interactive operational dashboard, while deliberately leaving AI verification for the next milestone. It includes a labeled ten-asset corpus, three change events, an exact/keyword baseline, regex-based value normalization, product/plan scoping, and tests.

A lightweight five-view dashboard in `web/` provides an operational overview, evidence-source management, change-event creation, an evidence-backed review queue, and reusable scan history. The workspace begins empty: users can fetch a public landing-page URL, upload a marketing file, add an email draft, or paste other campaign copy. Visitors can then model price, promotion, trial, or introductory-APR changes and run the deterministic scan in their browser.

The public URL importer uses a small guarded Vercel function in `api/extract.js`; it accepts public HTML and text pages while rejecting private-network targets, non-web protocols, oversized responses, and excessive redirects. When Supabase is connected, accounts, sources, private file uploads, and scan history persist between visits. Database grants and row-level security restrict every record to its owner. Without the cloud variables, the same app automatically remains a session-only browser demo. Scheduled monitoring remains the next backend milestone. The Chase scenario is available only through the optional sample button.

## Saved workspace setup

The application expects one Supabase project for authentication, Postgres storage, and private document storage.

1. Connect a Supabase project to the Vercel project.
2. Run `supabase/migrations/202608300001_saved_workspaces.sql` in that Supabase project's SQL editor.
3. Confirm that Vercel has `SUPABASE_URL` plus `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` (the `NEXT_PUBLIC_` variants are also recognized).
4. Redeploy the application.

Never place a Supabase service-role key in the browser or commit it to the repository. This app deliberately uses each signed-in user's access token so the database policies remain active.

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
npm run build
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
