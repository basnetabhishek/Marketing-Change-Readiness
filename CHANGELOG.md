# Change history

This file records notable product, data, evaluation, security, and deployment changes for Marketing Change Readiness.

## Unreleased

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
