---
title: The asset lifecycle
description: Five canonical statuses that every provider's states collapse into.
---

Every provider reports upload and encoding progress differently. Videos SDK collapses
them into **five canonical states** on `Asset.status`:

```ts
type AssetStatus =
  | 'waiting_upload' // asset created, bytes not received yet
  | 'uploading'      // bytes are being received / fetched from a URL
  | 'processing'     // transcoding / packaging
  | 'ready'          // playable
  | 'errored';       // upload or processing failed
```

Reading it is the same on every adapter:

```ts
const { status } = await videos.get(id);
if (status === 'ready') {
  const { hls } = await videos.playback(id);
}
```

## How providers map

| Canonical        | Mux         | Cloudflare Stream        | Bunny Stream                     |
| ---------------- | ----------- | ------------------------ | -------------------------------- |
| `waiting_upload` | —           | `pendingupload`          | `0` Created                      |
| `uploading`      | —           | `downloading`            | `1` Uploaded                     |
| `processing`     | `preparing` | `queued` · `inprogress`  | `2` Processing · `3` Transcoding |
| `ready`          | `ready`     | `ready`                  | `4` Finished                     |
| `errored`        | `errored`   | `error`                  | `5` Error · `6` UploadFailed     |

An unknown or new provider status falls back to `processing`, so your app never sees a
value outside the five canonical states.
