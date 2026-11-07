# MIMO AGENT

> Your Intelligent AI. Your Digital Workforce.

MIMO AGENT is a production-oriented AI agent web platform built with Next.js (App Router), TypeScript, Tailwind CSS, Zod, and PostgreSQL (pgvector). It connects to NVIDIA NIM's OpenAI-compatible chat-completions API and provides a dark-first chat workspace with nine agent modes, a bounded tool-using agent loop, per-user memory and document retrieval, and an admin console.

## Features

- **Chat workspace**: sidebar with history and search, streaming responses, Stop, regenerate, edit-and-resend, feedback, copy, voice input (where the browser supports it), and a responsive right-hand **Activity** panel (plan, tool calls, sources, memories, approvals).
- **Nine agent modes**: General, Research, Coding, Business, Writing, Data Analyst, Document, Multimodal, Planner. Each has its own instructions, temperature, and tool allow-list.
- **Bounded agent loop**: maximum steps and tool calls, per-tool timeouts, daily token budget, cancellation, repeated-call (loop) prevention, and a final "answer now" step.
- **Tools**: calculator, web search (LangSearch or Brave), document reader, data analysis (CSV statistics and SVG charts), code assistant (static review only), date/time, notes, tasks, memory search and save, image analysis (requires a vision model).
- **Approvals**: sensitive actions (saving notes, saving memories, and other write operations) require explicit user approval.
- **Accounts**: email and password, HttpOnly session cookies (only a SHA-256 hash of the token is stored), CSRF protection, same-origin checks, password reset, optional email verification, and roles `user` / `admin`.
- **Memory and RAG**: per-user memories and document chunks, full-text search, and vector search when an embedding model and pgvector are available. Retrieval is always filtered by owner.
- **Uploads**: PDF, TXT, CSV, DOCX, PNG, JPG, JPEG, with extension, MIME, and magic-byte validation and a size limit.
- **Admin console**: usage overview, user management (role and status), agent and tool enablement, health and capability report, audit log.
- **Security headers**: CSP, `frame-ancestors 'none'`, HSTS, `nosniff`, strict referrer policy.
- **Localisation-ready**: all UI strings live in `src/lib/i18n/en.ts`. Amharic is planned but not yet translated.

## Verification status

Everything below was executed in the build sandbox (PostgreSQL 17.11 + pgvector 0.8.0, Node 22, Chromium 131 for E2E).

| Check | Result |
|---|---|
| Type check (`npm run typecheck`) | Pass |
| Unit tests (48) | Pass |
| Integration tests (38): DB and migrations, auth, per-user isolation, security headers and CSRF, agent loop, real NVIDIA HTTP client, LangSearch client | Pass (86 unit + integration in total) |
| Production build (`npm run build`) | Pass |
| E2E 11-step user journey, desktop and mobile viewports (Playwright) | Pass |
| All top-level pages load with no uncaught JavaScript errors | Pass |
| NVIDIA NIM live API | **Not verified live.** The HTTP client is tested against a local OpenAI-compatible mock. Live verification needs your `NVIDIA_API_KEY` (see below). |
| LangSearch live API | **Not verified live.** Tested against a local mock of the documented request and response shape. |
| Vision / image analysis | Enabled only when `NVIDIA_VISION_MODEL` is set. Not claimed for any model by default. |
| Amharic | Not implemented (localisation scaffolding only). |

## Tests

```bash
npm run test:unit          # no database needed
npm run test:integration   # needs TEST_DATABASE_URL (or DATABASE_URL) pointing at a migrated PostgreSQL
npm run test:e2e           # needs a running server; set E2E_BASE_URL
```

For E2E, install a browser with `npx playwright install chromium`. In sandboxes where Playwright's CDN is blocked, set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium binary.

## Quick start

Requirements: Node.js 20.9+ and PostgreSQL 15+ with the `pgvector` extension (17 recommended).

```bash
npm install
cp .env.example .env.local        # then fill in values (never commit .env.local)
docker compose up -d db           # optional: local Postgres + pgvector
npm run migrate                   # applies SQL migrations (tracked in schema_migrations)
npm run dev                       # http://localhost:3000
```

Without pgvector, migrations still succeed and retrieval falls back to full-text search.

## Configuration

All configuration is read on the server. Nothing secret is sent to the browser.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase, Neon, RDS, or local). |
| `DATABASE_SSL` | `true` for managed providers that require TLS. |
| `NVIDIA_API_KEY` | **Server-only.** Your NVIDIA NIM key. Required for model responses. |
| `NVIDIA_BASE_URL` | Defaults to `https://integrate.api.nvidia.com/v1`. |
| `NVIDIA_MODEL` | Default chat model id. Must be a chat-completions model on your account. |
| `NVIDIA_MODEL_OPTIONS` | Comma-separated extra models shown in the selector (each must be enabled for your account). |
| `NVIDIA_VISION_MODEL` | Optional vision model. Leave empty to disable image analysis. |
| `NVIDIA_EMBEDDING_MODEL` / `MEMORY_EMBEDDING_DIM` | Optional embedding model for semantic memory; dimension must match. |
| `NVIDIA_TOOL_CALLING` | `auto` (default), `native`, or `json`. |
| `WEB_SEARCH_PROVIDER` | `none` (default), `langsearch`, or `brave`. |
| `LANGSEARCH_API_KEY` / `BRAVE_SEARCH_API_KEY` | **Server-only.** Keys for the chosen search provider. |
| `LANGSEARCH_BASE_URL` | Defaults to `https://api.langsearch.com`. Override only for testing against a mock. |
| `APP_URL` | Public base URL (used for same-origin checks and links). |
| `AUTH_COOKIE_SECURE` | `true` behind HTTPS (defaults to true in production). |
| `ADMIN_EMAILS` | Comma-separated emails promoted to admin on registration. |
| `EMAIL_VERIFICATION_REQUIRED`, `SMTP_URL` | Email verification and transactional mail. |
| `DEV_EXPOSE_AUTH_LINKS` | **Development only.** Returns verification and reset links in API responses. Never enable in production. |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Local upload storage and size limit. |
| `AGENT_MAX_STEPS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_OUTPUT_TOKENS`, `AGENT_DAILY_TOKEN_BUDGET`, `AGENT_TOOL_TIMEOUT_MS` | Agent limits and cost controls. |

### Connecting NVIDIA NIM

1. Create a key at NVIDIA's API catalog. Use a **new** key. Do not paste keys into chat, commit them, or place them in client-side code.
2. Set `NVIDIA_API_KEY` in your server environment (`.env.local` locally, or your hosting provider's secret store).
3. Set `NVIDIA_MODEL` to a model enabled for your account. The app only calls the server-side endpoint.
4. Open **Admin → Health** to confirm the NVIDIA status is `reachable`.

Vision is only used when `NVIDIA_VISION_MODEL` names a model that accepts images. Check the model card before enabling it.

### Connecting LangSearch

Set `WEB_SEARCH_PROVIDER=langsearch` and `LANGSEARCH_API_KEY`. The provider is called server-side at `https://api.langsearch.com/v1/web-search`. Search results are treated as untrusted data and cited in the answer.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Development server, production build, production server (port 3000, all interfaces). |
| `npm run migrate` | Apply pending SQL migrations. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test:unit` | Unit tests (no database). |
| `npm run test:integration` | Integration tests. Requires `TEST_DATABASE_URL`. |
| `npm run test:e2e` | Playwright journey. Requires a running server and `E2E_BASE_URL`. |

## Architecture

```
src/
  app/                 App Router pages (auth, workspace) and API route handlers (src/app/api)
  components/          UI: shell (sidebar), chat (workspace, composer, activity panel), views
  lib/
    agents/            controller (bounded loop), executor (tool calls), modes, planner, prompts
    ai/                NVIDIA NIM provider (OpenAI-compatible), SSE parsing, token estimates
    auth/              sessions, cookies, CSRF, route guards
    database/          pg pool, SQL migrations, migration runner
    memory/            chunking, extraction, retrieval (FTS + pgvector)
    security/          passwords (bcrypt), tokens, rate limits, redaction, sanitising
    services/          data access per domain (users, conversations, documents, ...)
    storage/           upload validation (MIME + magic bytes)
    tools/             tool registry and tool implementations
  middleware.ts        cookie-presence route gate (authorisation is re-checked server-side)
tests/
  unit/                pure logic tests
  integration/         database, auth, isolation, security, orchestration (scripted model),
                       NVIDIA HTTP client and LangSearch client (local mock servers)
  e2e/                 Playwright 11-step journey
```

Key design decisions:

- **Untrusted content.** Web pages, documents, and tool outputs are wrapped in `<untrusted_data>` delimiters and the model is instructed to treat them as data. Markdown rendering does not allow raw HTML.
- **No arbitrary execution.** The calculator is a bounded expression parser (not `eval`). The code assistant reviews code statically and never runs it.
- **Owner-scoped data.** Every query is filtered by the authenticated user id. Tests cover cross-user access to memories, conversations, and documents.
- **Honest failures.** Missing credentials produce an explicit error, never a simulated answer.

## Security notes

- Secrets live only in server environment variables. `.env*` files are git-ignored (except `.env.example`).
- Sessions: 256-bit random tokens; the database stores only the hash; `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- Login, registration, and password-reset endpoints are rate-limited.
- Errors are logged with secrets redacted.
- On a fresh deployment, the **first registered account becomes admin** unless you set `ADMIN_EMAILS` and register those emails first. Set `ADMIN_EMAILS` before exposing registration.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vercel, Node hosts, and database setup, and for the storage caveat for uploads.
