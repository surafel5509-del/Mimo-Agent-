# Deployment

## 1. Database

Provision PostgreSQL 15+ with the `pgvector` extension (Supabase, Neon, RDS, or self-hosted).

```bash
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB'
export DATABASE_SSL=true     # managed providers that require TLS
npm run migrate
```

Migrations are idempotent and recorded in `schema_migrations`. Run them before each release. Migration `002_pgvector.sql` enables `vector` when available and is a no-op otherwise.

If you change `MEMORY_EMBEDDING_DIM`, the vector columns must match the embedding model's output dimension. Create a fresh database or write a new migration; do not edit applied migrations.

## 2. Environment

Set these in your host's secret store (never in the repository):

- `DATABASE_URL`, `DATABASE_SSL`
- `NVIDIA_API_KEY` (server-only), `NVIDIA_MODEL`, optional `NVIDIA_VISION_MODEL`, `NVIDIA_EMBEDDING_MODEL`
- `LANGSEARCH_API_KEY` with `WEB_SEARCH_PROVIDER=langsearch` (optional)
- `APP_URL=https://your-domain`, `AUTH_COOKIE_SECURE=true`
- `ADMIN_EMAILS=you@your-domain` (set before first registration)
- `DEV_EXPOSE_AUTH_LINKS=false` (must be false in production)
- `SMTP_URL` and `EMAIL_VERIFICATION_REQUIRED=true` if you use email

Rotate any key that has been pasted into chat, tickets, or screenshots.

## 3. Build and run (Node host)

```bash
npm ci
npm run migrate
npm run build
npm start          # binds 0.0.0.0:3000; put a reverse proxy with TLS in front
```

Terminate TLS at a reverse proxy or the platform. HSTS is sent by the app, so serve only over HTTPS.

## 4. Vercel

The app is Vercel-compatible: API routes are dynamic, and the chat route streams Server-Sent Events with `maxDuration = 300`.

- Set the environment variables above in the Vercel project.
- **Uploads**: the default `UPLOAD_DIR` is local disk. Serverless functions have no persistent local disk, so uploaded files will not survive between invocations. Before using Vercel for document features, replace the storage adapter in `src/lib/storage/object-store.ts` with an object store (for example S3-compatible storage). Until then, treat document upload as unavailable on serverless.
- Choose a Node.js runtime version of 20.9 or later.

## 5. Post-deploy checks

1. `GET /api/health` returns `{"status":"ok","database":"ok"}`.
2. Sign in as the admin and open **Admin → Health**. Confirm NVIDIA shows `reachable` and capabilities match your configuration.
3. Send a test message. A reply confirms NVIDIA is working. An error that says the key is not configured means `NVIDIA_API_KEY` is not set on the server.
4. Confirm that `/api/auth/*` responses do not contain `devLink` (development links must be disabled).

## 6. Operations

- Usage and failures: **Admin → Overview** and **Audit log**.
- Logs are structured JSON on stdout with secrets redacted.
- Daily token budget per user: `AGENT_DAILY_TOKEN_BUDGET`.
- Back up PostgreSQL regularly. Uploaded files need their own backup policy.

## 7. Known limitations

- Uploads use local disk by default (see Vercel note above).
- Amharic translation is not yet available.
- Vision and tool-calling support depend on the chosen NVIDIA model. Check the model card.
- NVIDIA and LangSearch are verified against local mocks only; run the post-deploy checks above with real keys.
