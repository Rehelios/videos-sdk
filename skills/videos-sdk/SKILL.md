---
name: videos-sdk
description: >-
  Expert knowledge for videos-sdk — one type-safe, provider-agnostic video API
  across Rehelios, Mux, Bunny Stream, and Cloudflare Stream. Use this whenever
  the user wants to upload, ingest, list, delete, stream, thumbnail or sign
  playback for video from TypeScript/JavaScript, wants to swap or compare video
  providers without rewriting call sites, is wiring an adaptive HLS/DASH player,
  or hits a capability/compile error from `videos-sdk` — even when they only say
  "add video upload" or "host these videos" without naming the package.
---

# videos-sdk

`videos-sdk` is one small API over four video providers. You pick an adapter,
call the same methods, and the **types narrow to what that provider can actually
do** — so a provider that has no DASH won't let you read `.dash`. There is no
runtime capability check to write and no provider type leaking into app code.

Install:

```bash
bun add videos-sdk   # or: npm i videos-sdk
```

## The mental model

```ts
import { createVideos } from "videos-sdk";
import { mux } from "videos-sdk/mux";

const videos = createVideos({
  adapter: mux({ tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET! }),
});
```

Three rules that explain almost every question:

1. **The core knows no provider.** `createVideos` and the types come from
   `videos-sdk`; every adapter is a subpath — `videos-sdk/rehelios`, `/mux`,
   `/bunny`, `/cloudflare`. Swapping providers is one line; call sites don't move.
2. **Capabilities are literal types, and the facade narrows to them.** Methods a
   provider can't do **don't exist** on the returned object. That's a compile
   error, not a runtime surprise.
3. **Everything throws `VideoError`** with a discriminated `code`. Provider
   errors never surface raw.

## The API

Every adapter has this core, returning a normalized `Asset`. These are the
signatures — optional properties are marked `?`, so fill in real values:

```ts
create(input?: { title?: string; passthrough?: string }): Promise<Asset>
upload(key: string, body: VideoBody, options?: {
  contentType?: string; signal?: AbortSignal;
  onProgress?: (p: { bytesUploaded: number; bytesTotal: number }) => void;
}): Promise<Asset>
signedUploadUrl(options?: {
  key?: string; maxSizeBytes?: number; expiresInSeconds?: number;
}): Promise<UploadTicket>                                  // for browser uploads
get(id: string): Promise<Asset>
list(options?: { limit?: number; cursor?: string }): Promise<readonly Asset[]>
delete(id: string): Promise<void>
playback(id: string): Promise<{ hls: string; poster: string; dash?: string }>
thumbnail(id: string): string                              // sync, not a promise
```

Capability-gated — present only when the adapter declares them:

```ts
signedPlayback(id: string, options: { expiresInSeconds: number }): Promise<string>
ingestFromUrl(url: string, options?: { title?: string; passthrough?: string }): Promise<Asset>
captions: CaptionOps
webhooks: WebhookOps
```

In practice:

```ts
const asset = await videos.upload("intro.mp4", file, { contentType: "video/mp4" });
const url = await videos.signedPlayback(asset.id, { expiresInSeconds: 3600 });
```

`upload(key, body)` takes a `VideoBody`: `Blob | ReadableStream<Uint8Array> |
Uint8Array | ArrayBuffer | string`. `thumbnail()` is **synchronous** — it builds
a URL, it doesn't call the provider. `videos.adapter` is the escape hatch, and
`asset.raw` / `adapter.raw` hold the untouched provider payload when you need
something the normalized shape doesn't carry.

## Asset lifecycle

Every provider's status vocabulary collapses to five states. Unknown → `processing`.

```ts
type AssetStatus = "waiting_upload" | "uploading" | "processing" | "ready" | "errored";
```

`Asset` is `{ id, status, raw }` plus optional `duration`, `width`, `height`,
`createdAt`, `passthrough`. Transcoding is async: after `upload()` an asset is
usually `processing`, and playback only works once it's `ready`. Either verify a
webhook (below) or poll. **`ready` and `errored` are both terminal — a poll loop
that only waits for `ready` never returns on a failed encode:**

```ts
async function waitForReady(id: string): Promise<Asset> {
  for (;;) {
    const asset = await videos.get(id);
    if (asset.status === "ready") return asset;
    if (asset.status === "errored") throw new Error(`Encoding failed for ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
```

## Capability matrix

|                    | Rehelios | Mux    | Bunny  | Cloudflare |
| ------------------ | -------- | ------ | ------ | ---------- |
| `dash`             | ✅       | ❌     | ❌     | ✅         |
| `ingestFromUrl`    | ✅       | ✅     | ✅     | ✅         |
| `signedPlayback`   | ✅       | ✅     | ✅     | ✅         |
| `thumbnailAtTime`  | ❌       | ✅     | ❌     | ✅         |
| `captions`         | ✅       | ✅     | ✅     | ✅         |
| `captionSource`    | `file`   | `url`  | `file` | `file`     |
| `webhooks`         | ✅       | ✅     | ✅     | ✅         |

So this is a **compile error**, and that is the whole point — don't try to work
around it, pick the right provider or the right call:

```ts
const m = createVideos({ adapter: mux(cfg) });
(await m.playback(id)).dash;        // ❌ Property 'dash' does not exist
m.thumbnail(id, { time: 3 });       // ✅ Mux has thumbnailAtTime

const b = createVideos({ adapter: bunny(cfg) });
b.thumbnail(id, { time: 3 });       // ❌ Expected 1 argument, got 2
```

`signedPlayback` and `webhooks.verify` are *typed* as available on all four, but
they need credentials in the adapter config (see below) or they throw a typed
`VideoError` at runtime.

## Captions

`captionSource` decides what `captions.add` accepts, so the compiler picks the
right shape for you. **Mux ingests a subtitle track by fetching a public URL; the
other three take the file itself.**

```ts
await mux.captions.add(id, { language: "en", label: "English", url: "https://…/en.vtt" });
await bunny.captions.add(id, { language: "en", label: "English", body: vttFile });

await videos.captions.list(id);          // readonly Caption[]
await videos.captions.remove(id, caption.id);
```

`Caption.id` is whatever `remove()` needs: the **language code** on Rehelios,
Bunny and Cloudflare (they key captions by language, so re-adding the same
language replaces it), and the **track id** on Mux. `Caption.url` points at the
public `.vtt` on Mux and Bunny; Cloudflare and Rehelios don't expose one, so it
is absent there.

## Webhooks

`webhooks.verify(request)` checks the provider's HMAC signature and returns a
normalized event. It **throws** (`unauthorized`) on a bad signature or a stale
timestamp — so a resolved promise means the request is authentic. Pass the raw
`Request`; don't read its body first.

```ts
const event = await videos.webhooks.verify(request);
event.type;     // "asset.ready" | "asset.errored" | "upload.completed" | "asset.deleted" | "unknown"
event.assetId;  // string | undefined
event.raw;      // the provider's payload
```

Each adapter needs `webhookSecret` in its config. Where it comes from: **Mux** —
the per-endpoint signing secret in the dashboard. **Cloudflare** — the `secret`
returned when you create the webhook subscription. **Bunny** — the video
library's *read-only* API key. **Rehelios** — the org webhook secret (`whsec_…`).

`type` is `"unknown"` for any event the SDK doesn't model (a Mux track event, a
Bunny "resolution finished", a Rehelios `caption.ready`) — it is verified and
handed to you rather than thrown away. Not every provider emits every type:
Cloudflare only notifies on ready/errored, so `upload.completed` and
`asset.deleted` never arrive from it.

**`verify` proves authenticity, not uniqueness.** It has no idea whether it has
seen a delivery before, and providers retry — so a valid request can legitimately
arrive twice. Make the side effect idempotent (or dedupe on the provider's
delivery id from `event.raw`); never do "verify → charge/publish/email" blindly.

## Adapter config and gotchas

Every field without `?` is required:

```ts
import { rehelios } from "videos-sdk/rehelios";
rehelios({ apiKey: string, apiBaseUrl?, appUrl?, collectionId?, visibility?: "public" | "private", webhookSecret? });

import { mux } from "videos-sdk/mux";
mux({ tokenId: string, tokenSecret: string, signingKeyId?, signingKeySecret?, webhookSecret? });

import { bunny } from "videos-sdk/bunny";
bunny({ libraryId: string, apiKey: string, pullZone: string, tokenAuthKey?, webhookSecret? });

import { cloudflare } from "videos-sdk/cloudflare";
cloudflare({ accountId: string, apiToken: string, customerSubdomain: string, maxDurationSeconds?, webhookSecret? });
```

- **Rehelios** — `thumbnailAtTime` is false: `thumbnail()` returns a best-effort
  embed poster; the accurate poster is `playback().poster`. Signed playback needs
  `visibility: "private"` to be meaningful.
- **Mux** — asset id ≠ playback id. `Asset.id` is the **asset** id and that's what
  every method takes; `playback()` resolves the playback id for you. `thumbnail(id)`
  is best-effort (it treats `id` as a playback id), so prefer `playback().poster`
  when you have the choice. `signedPlayback` requires `signingKeyId` +
  `signingKeySecret`.
- **Bunny** — `libraryId` is numeric and `apiKey` is the **per-library** key, not
  the account key. (Find the library with `GET api.bunny.net/videolibrary` using
  the account key.) `signedPlayback` requires `tokenAuthKey`.
- **Cloudflare** — needs *paid* Stream. Direct uploads require a duration cap;
  `maxDurationSeconds` defaults to 21600. Playback and thumbnail URLs are
  deterministic from the uid.

## Errors

Never catch-and-guess. Switch on the code:

```ts
import { VideoError } from "videos-sdk";

try {
  await videos.get(id);
} catch (error) {
  if (error instanceof VideoError) {
    error.code;      // "unauthorized" | "not_found" | "unsupported_operation" | "upload_failed"
                     // | "rate_limited" | "provider_error" | "network" | "invalid_request"
    error.provider;  // "mux" | "bunny" | ...
    error.status;    // HTTP status, when there was one
  }
}
```

401/403 → `unauthorized`, 404 → `not_found`, 429 → `rate_limited`, other non-2xx
→ `provider_error`, a failed fetch → `network`.

## Recipes

**Browser upload without proxying bytes through your server** — mint the ticket
on the server, `PUT`/`POST` from the client:

```ts
const ticket = await videos.signedUploadUrl({ maxSizeBytes: 2_000_000_000 });
// -> { url, id, method }  send `url` + `id` to the browser
await fetch(ticket.url, { method: ticket.method, body: file });
await waitForReady(ticket.id);  // the loop above: stops on ready OR errored
```

**React to "the video is ready" instead of polling** — one route, any provider.
The handler must be idempotent, because a verified delivery can still be a retry:

```ts
export async function POST(request: Request) {
  const event = await videos.webhooks.verify(request);  // throws if not authentic
  if (event.type === "asset.ready" && event.assetId !== undefined) {
    await markPublishedOnce(event.assetId);  // idempotent: safe to run twice
  }
  return new Response(null, { status: 204 });
}
```

**Migrate a library without re-uploading:**

```ts
const asset = await videos.ingestFromUrl("https://old-host/video.mp4", { passthrough: legacyId });
```

**Play it.** Use `playback()` — never hand-build a manifest URL. Safari plays HLS
natively; everywhere else use hls.js:

```ts
const { hls, poster } = await videos.playback(id);
video.poster = poster;

if (video.canPlayType("application/vnd.apple.mpegurl")) {
  video.src = hls;
} else {
  const player = new Hls();
  player.loadSource(hls);      // `hls` is the manifest URL, not the player
  player.attachMedia(video);
}
```

## Conventions

Strict TypeScript, no `any`, ESM. Docs: <https://videos-sdk.com>.
The brand is "Rehelios" in prose; the identifiers stay lowercase
(`videos-sdk/rehelios`, `rehelios({ ... })`).
