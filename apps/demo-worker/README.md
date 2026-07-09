# demo-worker

Backs the upload demo on the `videos-sdk.com` landing page.

`apps/docs` is a static export, so it has no server to hold a Rehelios API key. This Worker
holds it instead. The browser runs the real `videos-sdk` against `apiBaseUrl = <this worker>`;
the Worker injects `x-api-key` and forwards only the four calls the demo needs. Video parts go
straight from the browser to R2 via presigned URLs — they never pass through here.

A cron sweeps the demo collection every 5 minutes and deletes anything older than 10 minutes,
so uploads don't accumulate.

## Surface

| Allowed | Everything else |
| --- | --- |
| `POST /v1/videos` (title clamped; `collectionId` + `visibility: public` forced) | `403` |
| `POST /v1/videos/:id/upload-init` (rejects non-`video/*` and files over `MAX_UPLOAD_BYTES`) | `403` |
| `POST /v1/videos/:id/upload-complete` | `403` |
| `GET /v1/videos/:id` | `403` |

Requests from an origin outside `ALLOWED_ORIGINS` get `403`, as do `list` and `delete` — the
browser can never enumerate or remove videos. Rate limited to 20 requests per minute per IP.

The cron refuses to run when `DEMO_COLLECTION_ID` is empty (that would sweep the whole org) and
only deletes assets whose `collectionId` matches it.

## Setup

The API key needs both `videos:read` and `videos:write` — the cron uses `list` and `delete`.

**1. Configure CORS on the Rehelios R2 bucket.** Without this the browser cannot `PUT` the
presigned parts and every upload fails with `Failed to fetch`. `ExposeHeaders: ["etag"]` is
required: the adapter reads the `ETag` of each part to complete the multipart upload.

```sh
bunx wrangler r2 bucket cors set rehelios --file cors.json
```

This needs an `r2:write` token — `wrangler login` grants no R2 scope by default, so either
re-login with it or apply `cors.json` from the Cloudflare dashboard (R2 → bucket → Settings →
CORS policy).

**2. Set the secrets.**

```sh
bunx wrangler secret put REHELIOS_API_KEY
bunx wrangler secret put DEMO_COLLECTION_ID
```

Point `DEMO_COLLECTION_ID` at a collection used for nothing else. The cron deletes everything
in it.

**3. Deploy, then point the docs at it.**

```sh
bunx wrangler deploy
```

Set `NEXT_PUBLIC_DEMO_API_URL` to the Worker URL in the Cloudflare Pages build environment, and
make sure that Pages origin is in `ALLOWED_ORIGINS` in `wrangler.jsonc`.

## Local

Copy `.dev.vars.example` to `.dev.vars` and fill it in — `.dev.vars` is gitignored, never commit
a live key.

```sh
bunx wrangler dev --port 8787
cd ../docs && NEXT_PUBLIC_DEMO_API_URL=http://localhost:8787 bun run dev
```

Cron triggers don't fire in local dev. Run it by hand:

```sh
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```
