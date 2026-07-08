---
title: Getting Started
description: Install videos-sdk and make your first call in under a minute.
---

Videos SDK gives you one small, honest API over multiple video providers. Swap the
adapter, keep every call site — and let the compiler catch what a provider can't do.

## Install

```bash
bun add videos-sdk
```

## Your first call

```ts
import { createVideos } from 'videos-sdk';
import { rehelios } from 'videos-sdk/rehelios';

const videos = createVideos({
  adapter: rehelios({ apiKey: process.env.REHELIOS_API_KEY! }),
});

const asset = await videos.upload('intro.mp4', file);
const { hls } = await videos.playback(asset.id);
```

## Switch providers

The only thing that changes is the adapter import and its config:

```ts
import { mux } from 'videos-sdk/mux';

const videos = createVideos({ adapter: mux({ tokenId, tokenSecret }) });
```

Every other call site — `upload`, `get`, `list`, `delete`, `playback`, `thumbnail`,
`signedPlayback` — stays exactly the same.

## What you get

- **One normalized `Asset`** across every provider, with a five-state lifecycle.
- **Capability-safe types** — unsupported operations are compile errors, not runtime surprises.
- **Web-standard I/O** — `Blob`, `ReadableStream`, `Uint8Array`, `ArrayBuffer`, or `string`.
- **Typed errors** — every failure throws a `VideoError` with a discriminated `code`.
