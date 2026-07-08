---
title: Capability-safe by types
description: How videos-sdk turns unsupported provider operations into compile errors.
---

Each adapter declares its capabilities as **literal types**. The `createVideos` facade
reads those types and narrows its API to match — so a provider that can't do something
never lets you call it.

```ts
const mux = createVideos({ adapter: mux(cfg) });
(await mux.playback(id)).dash; // ❌ Property 'dash' does not exist — Mux has no DASH

const cf = createVideos({ adapter: cloudflare(cfg) });
(await cf.playback(id)).dash; // ✅ string — Cloudflare supports DASH
```

The same applies to gated methods and options:

```ts
bunny.thumbnail(id, { time: 5 }); // ❌ Bunny thumbnails have no time offset
```

## The capability matrix

| Capability        | rehelios | Mux | Bunny | Cloudflare |
| ----------------- | :------: | :-: | :---: | :--------: |
| Resumable upload  |    ✓     |  ✓  |   ✓   |     ✓      |
| Ingest from URL   |    ✓     |  ✓  |   ✓   |     ✓      |
| HLS playback      |    ✓     |  ✓  |   ✓   |     ✓      |
| DASH playback     |    ✓     |  —  |   —   |     ✓      |
| Signed playback   |    ✓     |  ✓  |   ✓   |     ✓      |
| Thumbnail at time |    ✓     |  ✓  |   —   |     ✓      |
| Captions          |    ✓     |  ✓  |   ✓   |     ✓      |
| Webhooks          |    ✓     |  ✓  |   ✓   |     ✓      |

Where a provider can't do something, the SDK says so — in the types and in this table.
If you reach for it through a cast anyway, it throws a `VideoError` with code
`unsupported_operation` at runtime.
