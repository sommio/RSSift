# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0).

## [0.1.0] - 2026-04-23

### Added

- Initial release of RSSift: a summary-first RSS filtering product.
- Turborepo monorepo architecture featuring NestJS, Next.js, and Prisma.
- Real RSS/Atom/JSON feed ingestion backbone using the feedsmith parser.
- Subscription management via fixed "apps/api/feeds.opml" configuration.
- PostgreSQL persistence layer with a modular Prisma schema organization.
- Stable article identity rule for deduplication across repeated runs.
- Automatic article body extraction to Markdown using Mozilla Readability.
- AI-powered summary generation and title translation via OpenAI gateway.
- Structured LLM output validation using Zod for consistent reading views.
- Desktop-first dual-pane reader UI with URL-driven article selection.
- Independent scrollable panes for article list and summary detail views.
- Automatic background feed refresh on same-process wake from system sleep.
- Production-ready Docker images and VPS deployment path via Docker Compose.
- Caddy reverse proxy integration for simplified single-host self-hosting.
- PR-only GitHub Actions quality workflow with Vercel Remote Cache support.
- Local Git quality gates using Husky and lint-staged for pre-commit checks.
- ESLint maintainability guardrails for file size and code complexity.
- Bilingual documentation policy for synchronized English and Chinese docs.
- Sanitized LLM error handling with safe user-facing diagnostic feedback.
- Dedicated health and readiness probes for container orchestration.
