# videos-sdk

An agnostic, type-safe video SDK. One API across **rehelios**, **Mux**, **Bunny Stream**,
and **Cloudflare Stream** — swap the provider, keep every call site.

```ts
import { createVideos } from "videos-sdk";
import { rehelios } from "videos-sdk/rehelios";

const videos = createVideos({ adapter: rehelios({ apiKey: process.env.REHELIOS_API_KEY! }) });

const asset = await videos.upload("intro.mp4", file);
const { hls } = await videos.playback(asset.id);
```

Switching providers is one line — everything else is identical:

```ts
import { mux } from "videos-sdk/mux";
const videos = createVideos({ adapter: mux({ tokenId, tokenSecret }) });
```

## Capability-gated at the type level

Unsupported operations are **compile errors**, not runtime surprises. Each adapter declares
its capabilities as literal types, and the facade narrows the API to match:

```ts
const m = createVideos({ adapter: mux({ tokenId, tokenSecret }) });
(await m.playback(id)).dash; // ❌ TS error — Mux has no DASH

const cf = createVideos({ adapter: cloudflare({ accountId, apiToken, customerSubdomain }) });
(await cf.playback(id)).dash; // ✅ string — Cloudflare supports DASH

const b = createVideos({ adapter: bunny({ libraryId, apiKey, pullZone }) });
b.thumbnail(id, { time: 5 }); // ❌ TS error — Bunny thumbnails have no time offset
```

## Capabilities matrix

| Capability        | rehelios | Mux | Bunny | Cloudflare |
| ----------------- | :------: | :-: | :---: | :--------: |
| resumable upload  |    ✅    | ✅  |  ✅   |     ✅     |
| ingest from URL   |    ✅    | ✅  |  ✅   |     ✅     |
| HLS playback      |    ✅    | ✅  |  ✅   |     ✅     |
| DASH playback     |    ✅    | ❌  |  ❌   |     ✅     |
| signed playback   |    ✅    | ✅  |  ✅   |     ✅     |
| thumbnail at time |    ✅    | ✅  |  ❌   |     ✅     |
| captions          |    ✅    | ✅  |  ✅   |     ✅     |
| webhooks          |    ✅    | ✅  |  ✅   |     ✅     |

## Errors

Every failure throws a typed `VideoError` with a discriminated `code`:

```ts
import { VideoError } from "videos-sdk";

try {
  await videos.get(id);
} catch (error) {
  if (error instanceof VideoError && error.code === "not_found") {
    // ...
  }
}
```

## Workspace

Bun workspaces monorepo. The published package is `packages/videos-sdk`.

| Task      | Command             |
| --------- | ------------------- |
| Build     | `bun run build`     |
| Typecheck | `bun run typecheck` |
| Lint      | `bun run lint`      |
| Format    | `bun run format`    |

## License

MIT
