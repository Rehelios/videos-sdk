# videos-sdk

[![CI](https://github.com/Rehelios/videos-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Rehelios/videos-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/videos-sdk.svg)](https://www.npmjs.com/package/videos-sdk)
[![npm downloads](https://img.shields.io/npm/dm/videos-sdk.svg)](https://www.npmjs.com/package/videos-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

An agnostic, type-safe video SDK. One API across **rehelios**, **Mux**, **Bunny Stream**,
and **Cloudflare Stream** — swap the provider, keep every call site.

```bash
npm install videos-sdk
# or: bun add videos-sdk / pnpm add videos-sdk
```

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

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and the
change workflow, and [AGENTS.md](./AGENTS.md) if you're an AI agent. In short: make your
change, run `bun run release` to add a changelog entry, and open a PR — a bot comments a
release preview on it.

## Releases

Versioning and publishing are automated with [Tegami](https://tegami.fuma-nama.dev):

- Each PR carries a changelog entry describing its user-facing impact.
- Merging to `main` opens a **Version Packages** PR that collects entries into a
  version bump + `CHANGELOG.md`.
- Merging that PR publishes to npm — with [provenance](https://docs.npmjs.com/generating-provenance-statements)
  via OIDC trusted publishing — and creates the matching GitHub Release and tag.

## License

[MIT](./LICENSE) © Rehelios
