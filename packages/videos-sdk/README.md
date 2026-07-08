# videos-sdk

Agnostic, type-safe video SDK. One small, honest API across **rehelios**, **Mux**,
**Bunny Stream**, and **Cloudflare Stream** — swap the adapter, keep every call site, and
let the compiler catch what a provider can't do.

📖 **Docs:** [videos-sdk.com](https://videos-sdk.com) · **Source:** [github.com/rehelios/videos-sdk](https://github.com/rehelios/videos-sdk)

```bash
bun add videos-sdk   # or: npm i videos-sdk
```

## Quick start

```ts
import { createVideos } from 'videos-sdk';
import { rehelios } from 'videos-sdk/rehelios';

const videos = createVideos({
  adapter: rehelios({ apiKey: process.env.REHELIOS_API_KEY! }),
});

const asset = await videos.upload('intro.mp4', file);
const { hls } = await videos.playback(asset.id);
```

Switching providers changes one line — everything else is identical:

```ts
import { mux } from 'videos-sdk/mux';
const videos = createVideos({ adapter: mux({ tokenId, tokenSecret }) });
```

## Capability-safe by types

Unsupported operations are **compile errors**, not runtime surprises. Each adapter
declares its capabilities as literal types and the API narrows to match:

```ts
const m = createVideos({ adapter: mux(cfg) });
(await m.playback(id)).dash; // ❌ Mux has no DASH

const cf = createVideos({ adapter: cloudflare(cfg) });
(await cf.playback(id)).dash; // ✅ string
```

| Capability        | rehelios | Mux | Bunny | Cloudflare |
| ----------------- | :------: | :-: | :---: | :--------: |
| Resumable upload  |    ✓     | ✓   |  ✓    |     ✓      |
| Ingest from URL   |    ✓     | ✓   |  ✓    |     ✓      |
| HLS playback      |    ✓     | ✓   |  ✓    |     ✓      |
| DASH playback     |    ✓     | —   |  —    |     ✓      |
| Signed playback   |    ✓     | ✓   |  ✓    |     ✓      |
| Thumbnail at time |    —     | ✓   |  —    |     ✓      |
| Captions          |    ✓     | ✓   |  ✓    |     ✓      |
| Webhooks          |    ✓     | ✓   |  ✓    |     ✓      |

## Errors

Every failure throws a typed `VideoError` with a discriminated `code`:

```ts
import { VideoError } from 'videos-sdk';

try {
  await videos.get(id);
} catch (error) {
  if (error instanceof VideoError && error.code === 'not_found') {
    // ...
  }
}
```

MIT © Rehelios
