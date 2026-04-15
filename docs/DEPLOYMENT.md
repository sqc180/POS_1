# Deployment guide

This monorepo runs **Next.js** (`apps/web`) and **Fastify** (`apps/api`) against **MongoDB**, with **local filesystem storage** behind a `StorageProvider` abstraction (swap for S3/MinIO when scaling API horizontally).

## Environments

| Context       | `APP_ENV`     | Typical `NODE_ENV` | Database        | Notes                                      |
| ------------- | ------------- | ------------------ | --------------- | ------------------------------------------ |
| Local machine | `local`       | `development`      | Local or Atlas  | Hot reload, optional seeded data           |
| Shared dev    | `development` | `development`      | Dedicated DB    | Like prod config, non-production secrets   |
| Staging       | `staging`     | `production`       | Dedicated DB    | Razorpay test keys, full validation        |
| Production    | `production`  | `production`       | Production DB   | Secrets from env / secret manager only     |

Use a **separate MongoDB database** (or cluster) per environment. Never point local or CI at production data.

## Environment variables

See [`.env.example`](../.env.example) for the full list.

- **Backend**: validated at startup with Zod (`@repo/config`). Missing or invalid required variables fail fast.
- **Frontend**: public variables are validated when Next loads `next.config.ts` via `loadWebPublicEnv`.
- **Secrets**: `JWT_SECRET`, Razorpay secrets, and `MONGODB_URI` credentials must never use `NEXT_PUBLIC_*` and must not be committed.

### CORS and URLs

- Set **`CORS_ALLOWED_ORIGINS`** (comma-separated) to every browser origin that calls the API (e.g. `https://app.example.com`).
- Legacy **`WEB_ORIGIN`** is still accepted and merged in the loader if `CORS_ALLOWED_ORIGINS` is unset.
- **`APP_BASE_URL`** / **`API_BASE_URL`**: optional absolute URLs for webhooks, payment redirects, and future PDF links. Keep them environment-specific.

### Reverse proxy

When the API sits behind **Nginx** or another proxy:

- Set **`TRUST_PROXY=true`** so Fastify respects `X-Forwarded-*` headers.
- Terminate **TLS** at the proxy; use strong cipher suites and HSTS where appropriate.
- Align **`client_max_body_size`** (Nginx) with **`REQUEST_BODY_LIMIT`** (bytes) on the API for uploads.

Example Nginx layout: [`infra/nginx/pos.example.conf`](../infra/nginx/pos.example.conf).

**Path-based API** (single public origin): e.g. `https://app.example.com/api/*` → upstream API, and set `NEXT_PUBLIC_API_BASE_URL=https://app.example.com/api`. Configure CORS for `https://app.example.com` only.

**Subdomain API**: e.g. `https://api.example.com` — add both web and API origins to `CORS_ALLOWED_ORIGINS` if the browser calls the API cross-origin.

### Storage and horizontal scaling

- **`STORAGE_PROVIDER=local`**: files under **`STORAGE_ROOT_PATH`** (default `./storage`). Mount a **persistent volume** in Docker/Kubernetes; do not store uploads under the app image layers.
- **`PDF_STORAGE_PATH`**: optional relative folder under the storage root for generated PDFs.
- **Multiple API instances** require **shared storage** (S3, MinIO, NFS, etc.): implement another `StorageProvider` and extend `createStorageFromEnv` — domain services stay unchanged.

### Health checks

- **`GET /health`**: liveness (process up).
- **`GET /ready`**: MongoDB ping + local storage writability (for `local` provider).

Use these in load balancers, Docker `HEALTHCHECK`, and CI smoke steps.

### Razorpay (staging vs production)

- **Staging**: use Razorpay test keys and register a **staging** webhook URL pointing at `https://<api-host>/webhooks/razorpay`.
- **Production**: live keys and production webhook URL; keep **`RAZORPAY_WEBHOOK_SECRET`** in a secret store.

### Rate limiting (future)

Auth, webhooks, and document endpoints are candidates for `@fastify/rate-limit`. Not enabled by default; add when traffic patterns warrant it.

### Backups

- **MongoDB**: scheduled dumps or managed backups; test restores regularly.
- **Files**: backup the volume backing **`STORAGE_ROOT_PATH`** together with DB so invoice/receipt PDFs stay consistent with metadata in MongoDB.

## Docker

From the repository root:

```bash
# Build images
docker build -f Dockerfile.api -t pos-api:local .
docker build -f Dockerfile.web -t pos-web:local \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 .

# Full stack (Mongo + API + web) — profile "full"
docker compose --profile full up --build
```

The API service uses **`COMPOSE_MONGODB_URI`** (default **`mongodb://mongo:27017/pos_erp_dev`**) so it talks to the **`mongo` container** on the Docker network. Your host **`.env`** value **`MONGODB_URI=127.0.0.1…`** is for **`pnpm dev`** only and is not passed into the container for this profile.

Override secrets via environment or an env file; see `docker-compose.yml`.

## Local development

```bash
pnpm install
pnpm dev
```

Runs Turbo `dev` for web and API. Ensure MongoDB matches **`MONGODB_URI`** and CORS includes the Next origin.

## CI / release sequence

Suggested order (see root `package.json` **`ci`** script):

1. Install dependencies (`pnpm install --frozen-lockfile`)
2. Lint
3. Typecheck
4. Tests (`pnpm test` runs API Vitest suite)
5. Build (`pnpm build`)

Optional: build Docker images, deploy to staging, run smoke checks against `/health` and `/ready`, then promote to production with manual approval.

## Docker stack (API + web, external MongoDB)

For **Atlas** (or any remote MongoDB), use **`docker-compose.stack.yml`**: it runs **only** `api` and `web` (no bundled `mongo` service).

1. In the repo root, ensure `.env` (or exported shell variables) defines at least:
   - `MONGODB_URI`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS` (must include the browser origin of the Next app, e.g. `https://app.example.com` or `http://YOUR_SERVER_IP:3000`)
   - `NEXT_PUBLIC_API_BASE_URL` — full URL the **browser** uses to call the API (e.g. `http://YOUR_SERVER_IP:4000` or `https://api.example.com`)
2. Run:

```bash
docker compose -f docker-compose.stack.yml up --build -d
```

3. Smoke: `curl -sS http://localhost:4000/health` and open `http://localhost:3000` (or mapped ports via `API_PUBLISH_PORT` / `WEB_PUBLISH_PORT`).

## GitHub Container Registry (GHCR)

Workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) builds **`Dockerfile.api`** and **`Dockerfile.web`** and pushes to **`ghcr.io/<owner>/<repo>-api`** and **`-web`** (repository name lowercased).

1. GitHub → **Settings** → **Actions** → **General** → **Workflow permissions** → enable **Read and write** (needed for `GITHUB_TOKEN` to push packages).
2. **Actions** → **Docker publish** → **Run workflow** → set **Public API base URL** to the real API URL users will call from the browser (this is compiled into the web image).
3. After the run, make each package **public** (optional) under **Packages**, or stay private and `docker login ghcr.io` on the server.

## GitLab CI / Jenkins

Mirror the stages in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): install → lint → typecheck → test → build. Add deploy steps and credentials in your platform.
