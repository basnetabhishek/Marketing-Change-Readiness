# Change history

This file records notable product, data, evaluation, security, and deployment changes for Marketing Change Readiness.

## 2026-09-01 — Groq Smart Scan

### Changed

- Replaced Vercel AI Gateway with the direct Groq provider so the dynamic demo can run on Groq's rate-limited free plan without requiring a Vercel billing card.
- Selected Groq's production `openai/gpt-oss-20b` model with strict structured output.
- Bounded each AI scan to eight compact evidence excerpts to fit the free-plan request limits more reliably.

### Security

- Smart Scan reads `GROQ_API_KEY` only in the server function; the credential is excluded from local environment files and never sent to the browser.
- Deterministic matching remains the automatic fallback when Groq is unavailable or rate-limited.

## 2026-09-01 — Evidence-constrained Smart Scan

### Production compatibility fix

- Routed structured text verification through the explicit Vercel AI Gateway model wrapper.
- Changed the first production release to review up to ten in-scope sources directly because AI Gateway does not proxy embedding models.
- Kept the private embedding cache schema and retrieval boundary ready for a future direct-provider connection.
- Added safe server-side error logging while preserving deterministic fallback behavior.

### Added

- Semantic retrieval for paraphrased, implied, comparison, and threshold-based marketing claims.
- Schema-constrained AI verification with affected, not-affected, and uncertain decisions; confidence; exact evidence; explanation; and recommended action.
- A Smart Scan / Deterministic only selector and AI-aware review cards, history labels, report exports, and fallback states.
- Private embedding reuse and durable AI-generation records with model, prompt hash, token usage, result, error state, and timestamps.

### Changed

- The deterministic engine now acts as a protected safety layer inside Smart Scan: literal matches remain in the queue even when AI disagrees.
- Smart Scan degrades to deterministic results when the AI service is unavailable instead of blocking readiness work.

### Security

- Only authenticated users can run Smart Scan, and database row-level policies isolate embeddings and generations by account.
- Evidence is explicitly labeled as untrusted model input, structured output is schema-validated, and every returned quote is checked against the saved source before display.
- At most ten in-scope evidence excerpts are sent through Vercel AI Gateway; credentials remain server-side through Vercel OIDC.

## 2026-09-01 — Production cloud activation

### Changed

- Connected the production and preview Vercel environments to the project Supabase database.
- Activated the deployment-time database migrations required for saved accounts, private evidence, scan history, and scheduled monitoring.

### Security

- Database credentials and Supabase keys are synchronized through Vercel environment variables rather than committed to the repository.

## 2026-08-31 — Automated webpage monitoring

### Added

- On-demand checks for saved public webpage evidence, with meaningful visible-text change detection.
- Daily Vercel Cron monitoring for up to five due webpage sources per production run.
- Timestamped source snapshots for changed, unchanged, and failed checks.
- Dashboard controls to check a page immediately, enable daily monitoring, or pause monitoring.

### Changed

- Saved sources now show their most recent check time, monitoring state, and changed or failed status.
- Recent activity now includes automatic and manual webpage-check events.

### Security

- The scheduled endpoint requires Vercel's bearer `CRON_SECRET` and a server-only Postgres connection.
- Scheduled and manual checks reuse the existing public-IP validation, DNS pinning, redirect, response-size, content-type, and timeout protections.

## 2026-08-31 — Saved workspaces

### Added

- A database-ready saved workspace with email/password accounts, secure session cookies, refresh-safe evidence, and saved scan history.
- A fifth History view that reopens earlier change events and their evidence-backed review results.
- Private marketing-document storage with server-side text extraction for PDF and DOCX, alongside existing text formats.
- A Supabase migration for evidence sources, change events, private file storage, ownership indexes, grants, and row-level access policies.
- Automatic, one-time cloud database setup on the first deployment after the Supabase integration is connected.
- Cloud-layer tests for session parsing, authenticated ownership binding, source validation, scan validation, and upload boundaries.

### Changed

- The dashboard now detects whether cloud services are connected and automatically preserves the existing browser demo when they are unavailable or intentionally skipped.
- Signed-in source additions, removals, optional samples, and readiness scans now write through the saved workspace API.

### Security

- Account tokens are stored in secure, HTTP-only, same-site cookies and refreshed server-side.
- Every database operation runs with the signed-in user's token, while database row-level rules independently restrict records to their owner.
- Uploaded files are private, limited to 2 MB, restricted to supported formats, checked for PDF/DOCX file signatures, and stored below an account-specific path.

## 2026-08-30 — User-driven evidence ingestion

### Added

- An empty-by-default evidence workspace instead of automatically loading Chase data.
- Four evidence intake paths: public webpage URL, text-based file upload, email draft, and pasted marketing copy.
- An optional Chase introductory-APR sample that users load intentionally.
- Public webpage text extraction through a small server function.
- Source removal, duplicate detection, file-size and file-type validation, dynamic scan scope, and derived company/product suggestions.

### Changed

- Newly added evidence now updates an existing scan result immediately.
- The New Change and Review Queue views now have proper no-source and no-scan states.
- The README now explains which evidence is processed on the server and which remains in the browser session.

### Security

- Public URL imports reject private and reserved network addresses, embedded credentials, non-web protocols, unusual ports, excessive redirects, oversized responses, unsupported content types, and slow responses.
- Outbound requests are pinned to validated public IP addresses to reduce DNS-rebinding risk.
- Page extraction uses bounded, non-executing text parsing and excludes scripts, embedded content, and common hidden content.
- Anonymous webpage imports have same-origin checks, request limits, and a small per-client rate limit.

## 2026-08-30 — Operational dashboard

### Added

- A four-view dashboard: Overview, Sources, New Change, and Review Queue.
- The Charcoal & Lime visual system, responsive navigation, empty states, evidence highlighting, and JSON report export.
- An interactive Chase Freedom Flex introductory-APR scenario.
- Browser-based deterministic scanning for price, promotion, trial-duration, and introductory-APR changes.

### Changed

- Replaced the original benchmark landing page with an operational product workflow.
- Improved keyboard focus, form contrast, mobile layout, and review-queue presentation.

## 2026-08-30 — Deterministic evaluation core

### Added

- A labeled ten-asset marketing corpus with change events and expected affected assets.
- An exact/keyword retrieval baseline.
- Regex-based normalization for prices, percentages, and durations.
- Company, product, and plan scope matching.
- Precision, recall, candidate-count, and manual-review-reduction metrics.
- Unit tests and a reproducible command-line evaluation report.
- Extension boundaries for future embeddings and an LLM verifier without adding an agent framework.

## Maintenance convention

- Record every material user-facing, evaluation, security, or deployment change under **Unreleased**.
- Use **Added**, **Changed**, **Fixed**, **Removed**, and **Security** headings when relevant.
- Move completed entries into a dated section when the corresponding production update is deployed.
- Keep entries outcome-focused and link to a commit or issue when additional context is useful.
