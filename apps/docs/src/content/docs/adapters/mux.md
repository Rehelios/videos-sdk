---
title: Mux
description: The Mux adapter for videos-sdk.
---

```ts
import { createVideos } from 'videos-sdk';
import { mux } from 'videos-sdk/mux';

const videos = createVideos({ adapter: mux({ tokenId, tokenSecret }) });
```

## Config

| Option              | Type     | Required | Description                          |
| ------------------- | -------- | :------: | ------------------------------------ |
| `tokenId`           | `string` |    ✓     | Mux API access token id.             |
| `tokenSecret`       | `string` |    ✓     | Mux API secret key.                  |
| `signingKeyId`      | `string` |    —     | Signing key id for signed playback.  |
| `signingKeySecret`  | `string` |    —     | Signing key secret for signed playback. |

## Capabilities

Mux does **not** support DASH playback — `playback().dash` is absent from the type. All
other capabilities are supported.
