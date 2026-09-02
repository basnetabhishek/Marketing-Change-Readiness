# Marketing Change Readiness

[Change history](CHANGELOG.md)

Marketing teams often leave stale claims behind when a price, promotion, or trial changes. A search for the literal old value misses formatting variants such as `79 dollars`, `25 percent`, or `one month`; broad search also creates noise from other products and plans.

The project pairs a deterministic candidate-retrieval core with an interactive operational dashboard and an optional evidence-constrained Smart Scan. It includes a labeled ten-asset corpus, three change events, an exact/keyword baseline, regex-based value normalization, product/plan scoping, bounded in-scope AI review, structured verification, and tests.

A lightweight five-view dashboard in `web/` provides an operational overview, evidence-source management, change-event creation, an evidence-backed review queue, and reusable scan history. Saved scans can be reopened or permanently deleted by their owner; deletion removes the related AI-generation record without removing evidence sources or monitoring alerts. The workspace begins empty: users can fetch a public landing-page URL, upload a marketing file, add an email draft, or paste other campaign copy. Visitors can then model price, promotion, trial, or introductory-APR changes. Signed-in users can choose Smart Scan; browser-demo users retain the reproducible deterministic scan.

The public URL importer uses a small guarded Vercel function in `api/extract.js`; it accepts public HTML and text pages while rejecting private-network targets, non-web protocols, oversized responses, and excessive redirects. When Supabase is connected, accounts, sources, private file uploads, scan history, webpage snapshots, and monitoring alerts persist between visits. Database grants and row-level security restrict every record to its owner. Saved webpage sources can be checked on demand or enrolled in a daily Vercel Cron job; whitespace-only differences are ignored, meaningful visible-text changes are retained, and failures are shown without overwriting the last good evidence. Every changed page is automatically rescanned against the latest approved change event (or the latest scenario when no approved change exists), and the resulting evidence-backed alert appears in the dashboard. Without the cloud variables, the same app automatically remains a session-only browser demo. The Chase scenario is available only through the optional sample button.

## Saved workspace setup

The application expects one Supabase project for authentication, Postgres storage, and private document storage.

1. Connect a Supabase project to the Vercel project and enable it for Production and Preview.
2. Redeploy the application. The build applies `supabase/migrations/202608300001_saved_workspaces.sql` once, then records it so later deployments do not repeat it.
3. Confirm that Vercel has `SUPABASE_URL`, `POSTGRES_URL`, and either `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` (the `NEXT_PUBLIC_` variants are also recognized).
4. Add a strong `CRON_SECRET` value in Vercel. Production then calls `/api/monitor` once daily at 08:00 UTC and checks up to five due webpage sources per run, which stays within the Hobby plan schedule limit.
5. Create a free GroqCloud API key from [Groq API Keys](https://console.groq.com/keys).
6. Add it to the Vercel project as a server-only environment variable named `GROQ_API_KEY` for Production and Preview, then redeploy. Never commit the key or prefix it with `NEXT_PUBLIC_`.

In-app monitoring alerts require no additional service. Optional email delivery is deliberately opt-in: connect Resend, set `RESEND_API_KEY` and a verified sender in `ALERT_EMAIL_FROM`, then users can turn on **Email alerts** in their own workspace. No email is sent merely because an account exists.

Never place a Supabase service-role key in the browser or commit it to the repository. This app deliberately uses each signed-in user's access token so the database policies remain active.

## Test the live workflow

1. Sign in and add a public landing-page URL under **Sources**.
2. Select **Check now** to create the first timestamped snapshot.
3. Select **Monitor daily** to include that page in automatic production checks.
4. Save an approved change event for the same company and product.
5. When the visible page text changes, its status becomes **Changed**, the latest change is applied automatically, and a severity-based item appears under **Monitoring alerts**.
6. Open the alert to inspect the exact matched claim, or mark it reviewed when no action is required.
7. Choose **Smart Scan** whenever you want an additional semantic review across the full bounded in-scope evidence set.

## How Smart Scan works

1. Product and plan rules exclude out-of-scope evidence before any model call.
2. The deterministic engine finds literal and normalized old-value matches.
3. Up to eight compact in-scope excerpts are sent to Groq's schema-constrained verifier so it can identify paraphrases, implications, comparisons, and thresholds that literal search can miss.
4. The verifier classifies every source as affected, not affected, or uncertain and must return an exact quote.
5. The server checks every returned quote against the saved source text. Unsupported AI-only results are discarded; deterministic matches are never removed by an AI disagreement.
6. The generation ID, model, token usage, result, and error state are saved per user. If AI is unavailable, the scan returns the deterministic safety net instead of failing.

Smart Scan uses Groq's production `openai/gpt-oss-20b` model and sends at most eight compact in-scope evidence excerpts. Source text is labeled as untrusted evidence, model output is schema-validated, and database row-level security keeps generation history and the future embedding cache isolated by account. Groq's free plan is rate-limited; when the limit is unavailable or exhausted, the app returns the deterministic safety net instead of blocking the scan.

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
api/analyze.js     authenticated bounded retrieval and structured verification
server/ai-readiness.js  evidence validation, ranking, and deterministic/AI merge rules
supabase/migrations/    private workspace, monitoring, embeddings, and AI-generation history
```

The Python `Retriever` callable boundary remains the reproducible evaluation interface. The production Smart Scan is additive: deterministic results stay independently testable, and AI failures cannot remove literal old-value matches.
