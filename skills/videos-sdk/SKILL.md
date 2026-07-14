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

**Require `>= 0.2.0`.** In `0.1.x`, `captions` and `webhooks` were declared in
`capabilities` but their methods were unimplemented stubs that threw at runtime —
so on an old install the compiler lets the call through and it fails in
production. They are real from `0.2.0` on. Check the installed version before
concluding anything about them.

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

**Compare against `AssetStatus`, never against a provider's own status string.**
The five states above are the whole contract; the raw vocabulary differs per
provider and is not part of it (Rehelios, for instance, emits `created`,
`uploading`, `queued`, `transcoding`, `ready`, `failed` — no `errored`, no
`processing`; the adapter is what maps them). Hand-writing a union of what you
think the provider sends is how you get a branch that never fires: because
unknown → `processing`, a status you guessed wrong looks like "still encoding"
forever, and a failed encode silently polls until the end of time. If you need the
provider's own value it is on `asset.raw` — but branch on `asset.status`.

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
  `visibility: "private"` to be meaningful. `apiBaseUrl` is the **origin**
  (`https://api.rehelios.com`) — the SDK appends `/v1` itself. A base that already
  ends in `/v1` is tolerated (stripped), but don't rely on that elsewhere.
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

## Signed playback

```ts
const url = await videos.signedPlayback(id, { expiresInSeconds: 3600 });
```

You get back a manifest URL carrying a token. Hand it straight to the player —
`hls.js`, Vidstack, or a native `<video>` on Safari/iOS. **You sign the master
manifest and nothing else.**

The reflex worry — *"the token expires in an hour, so playback dies an hour in,
and segment URLs are baked into the media playlist, so a short TTL cuts the video
off mid-watch"* — **is wrong, and it is worth being explicit about because it
looks right on paper.** `expiresInSeconds` bounds how long the *link* stays
usable, not how long a session that already started may run. A player fetches the
manifest once, up front, and every provider here issues playback credentials for
the media itself at that moment:

- **Rehelios** — the CDN rewrites the manifest on the way out, stamping a **fresh
  6h session token** on every child URI (variants, segments, subtitles, thumbnail
  sprites). The token you minted only has to survive the single `master.m3u8`
  request; it is never the token the segments carry.
- **Mux / Bunny / Cloudflare** — the signed manifest authorizes the session at the
  edge the same way.

So: **don't build token-refresh plumbing.** No `xhrSetup` hook to swap a stale
token, no re-signing on a timer, no swapping `src` mid-playback (which would only
reset the player anyway). There is nothing to refresh, and native HLS on iOS —
where no request hook exists at all — works for exactly that reason. If you are
about to write a workaround for expiring segment tokens, the premise is false;
check the child URI's token before you build anything.

On Rehelios specifically, `signedPlayback` only *means* something for a video with
`visibility: "private"` — public videos play from a stable unsigned URL by design.

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

**429 is retried for you** — up to 5 times. If the provider sends `Retry-After`,
the client waits exactly that long; otherwise it backs off exponentially with
jitter (capped at 20s). It never retries *earlier* than asked: a `Retry-After`
above 60s is not clamped and slept through, it simply isn't retried — blocking
your call for minutes is your decision, not the SDK's, so you get `rate_limited`
straight away and can schedule the work yourself.

A `rate_limited` error therefore means the retries are already spent — don't wrap
calls in a retry loop of your own. Nothing else is retried: a 429 is safe to
replay because the request was rejected rather than processed, which isn't true
of a network failure mid-`POST`.

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
