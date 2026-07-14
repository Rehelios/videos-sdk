# videos-sdk

Agnostic, type-safe video SDK. **One small, honest API across rehelios, Mux, Bunny Stream,
and Cloudflare Stream** — swap the adapter, keep every call site, and let the compiler
catch what a provider can't do. Published on npm as **`videos-sdk`** (unscoped, public).

Bun workspaces monorepo:

- **`packages/videos-sdk`** — the published package. Core (`createVideos`, the
  `VideoAdapter` contract, capability-typed facade, `VideoError`) + one adapter per
  provider, each a subpath export (`videos-sdk/rehelios`, `/mux`, `/bunny`, `/cloudflare`).
- **`apps/docs`** — the public docs site (`videos-sdk.com`, hosted on Cloudflare Pages).
  **Fumadocs on Next.js**, built as a **static export** (`output: 'export'`).

## Commands

Run from the repo root:

| Task | Command |
| --- | --- |
| Typecheck (all packages) | `bun run typecheck` |
| Build the SDK | `bun run build` |
| Test the SDK | `bun run test` |
| Lint / format | `bun run lint` · `bun run format` (biome) |
| SDK only | `bun run --filter videos-sdk <build\|typecheck\|test>` |
| Docs dev / build | `cd apps/docs && bun run dev` · `bun run build` |
| Docs deploy (Cloudflare Pages) | `cd apps/docs && bun run deploy` |

## SDK architecture (packages/videos-sdk)

The whole point is a **provider-agnostic core** with **compile-time capability safety**.
When touching the SDK, match these:

1. **The core knows no provider.** `src/index.ts` re-exports only `createVideos`, types,
   `VideoAdapter`, and `VideoError`. Every provider lives in its own file
   (`src/rehelios.ts`, `mux.ts`, `bunny.ts`, `cloudflare.ts`) exported as a subpath. Adding
   a provider never touches the core.

2. **Adapters are capability-typed.** Each adapter factory returns
   `VideoAdapter<C>` where `C` is a **literal** `Capabilities` type (e.g. Mux is
   `{ dash: false; thumbnailAtTime: true; ... }`). `createVideos({ adapter })` is generic
   over the adapter and **narrows the public API to those capabilities** (`src/facade.ts`):
   - `Gate<Cond, T>` adds a method only when the capability is `true` (`signedPlayback`,
     `ingestFromUrl`, `captions`, `webhooks`).
   - `PlaybackOf<C>` omits `dash` from `playback()`'s return unless `C['dash']` is `true`.
   - `thumbnail(id, ...args)` only accepts a `{ time }` option when `thumbnailAtTime` is
     `true`.
   So `mux.playback(id).dash` and `bunny.thumbnail(id, { time })` are **compile errors**.
   `test/types.ts` asserts this with `@ts-expect-error` — keep it green.

3. **`createVideos` is a thin facade.** It just forwards to the adapter (with one
   `as unknown as Videos<A>` cast at the boundary — the only cast of its kind). Don't add
   logic here; provider behavior belongs in the adapter.

4. **Normalized `Asset` + five-state lifecycle.** Every adapter maps its provider status
   into `AssetStatus = 'waiting_upload' | 'uploading' | 'processing' | 'ready' | 'errored'`
   (unknown → `processing`). `Asset` fields are `raw` (the provider object) plus optional
   normalized `duration`/`width`/`height`/`createdAt`/`passthrough`.

5. **Typed errors, always.** Everything throws a `VideoError` with a discriminated `code`
   (`src/errors.ts`) and `provider`/`status`. The shared HTTP client (`src/internal/http.ts`)
   maps status → code (401/403→`unauthorized`, 404→`not_found`, 429→`rate_limited`, else
   `provider_error`; fetch throw → `network`). Never surface a raw provider error.

6. **Per-provider auth/envelope live in the adapter, not the http client.** `createHttpClient`
   takes `{ baseUrl, headers, provider }`. rehelios uses `x-api-key` + a `{ success, data }`
   envelope (unwrap `.data`); Mux uses Basic auth + `{ data }`; Bunny uses `AccessKey` +
   raw JSON; Cloudflare uses Bearer + `{ result, success }`.

7. **Webhook verification is shared, the envelope is not.** `src/internal/webhooks.ts` has the
   WebCrypto HMAC-SHA256 + constant-time compare + timestamp tolerance (300s); each adapter
   only supplies its header names, signed string, and event mapping. `verify()` throws
   `unauthorized` on a bad signature or stale timestamp, so a resolved promise means the
   request is authentic. An event the SDK doesn't model normalizes to `type: "unknown"`
   rather than throwing.

8. **`captionSource` narrows `captions.add`.** Mux only ingests captions from a public URL;
   the other three take the file. So `Capabilities` carries `captionSource: "file" | "url"`
   and `CaptionInputOf<C>` picks `CaptionFileInput` or `CaptionUrlInput` — passing a `body`
   to Mux is a compile error, not a runtime one. `Caption.id` is whatever `remove()` takes:
   the language code everywhere except Mux, which uses the track id.

### Adapter status (as of v0.2.0)

| Adapter | Implemented | Verified |
| --- | --- | --- |
| **rehelios** | full core + multipart upload + import + signed playback + captions + webhooks | ✅ unit tests vs the real contract (see below) |
| **Mux** | core + direct upload + ingest + RS256 (WebCrypto) signed playback + captions + webhooks | ✅ live against a real account; captions/webhooks unit-tested vs the docs |
| **Bunny** | core + PUT upload + fetch + SHA-256 token signed playback + captions + webhooks | ✅ live against a real account; captions/webhooks unit-tested vs the docs |
| **Cloudflare** | core + direct upload + copy + `/token` signed playback + captions + webhooks | ✅ against the official docs |

Captions and webhooks are implemented on all four but have **not** been exercised live yet —
they are covered by unit tests written against the official contracts.

### Provider gotchas

- **rehelios** is the reference (it's our own product; the real API is in the
  `../rehelios` repo's `apps/api`, notably `routes/videos.ts` + `sdk/`). Base
  `api.rehelios.com`, embeds via `app.rehelios.com/embed/:id`. `ReheliosConfig` takes a
  default `collectionId` + `visibility`. Upload is create → `upload-init` (presigned R2
  multipart) → PUT parts → `upload-complete`. `thumbnailAtTime` is **false** (fixed poster
  only); `thumbnail()` returns a best-effort embed poster URL — the accurate poster comes
  from `playback().poster`.
- **Mux** distinguishes asset id vs playback id. `Asset.id` is the asset id; `playback()`
  fetches the asset to resolve the public playback id; `thumbnail(id)` is best-effort
  (treats `id` as a playback id). Direct upload resolves the asset id by polling
  `/uploads/{id}`. `signedPlayback` needs `signingKeyId` + `signingKeySecret`.
- **Bunny** needs a numeric `libraryId` (discover it via `GET api.bunny.net/videolibrary`
  with the *account* key — the per-library `ApiKey` is what the adapter uses). `signedPlayback`
  needs `tokenAuthKey`.
- **Cloudflare** requires paid Stream. `direct_upload` **requires `maxDurationSeconds`**
  (config default 21600). Playback/thumbnail are deterministic from the uid.

## Code style

**Do NOT add comments to code.** Names + small functions instead (only exception: a comment
the user explicitly asks for). TypeScript is strict to the max in the SDK
(`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `isolatedModules`, **no `any`**
(biome `noExplicitAny: error`). Recurring gotchas:

- Under `exactOptionalPropertyTypes`, never assign `undefined` to an optional prop — spread
  conditionally: `...(x !== undefined ? { k: x } : {})`.
- TS 6's generic `Uint8Array<ArrayBufferLike>` isn't assignable to `BlobPart`/`BodyInit` —
  cast at the fetch/Blob boundary (`body as BlobPart`, `body as BodyInit`).
- The SDK uses `moduleResolution: bundler` with extensionless imports; tsup bundles ESM
  + `.d.ts`. `scripts/` and `test/*.test.ts` are excluded from `tsc` (bun runs them).

## Docs app (apps/docs)

Fumadocs on **Next.js**, **static export** (`next.config.mjs` → `output: 'export'`) →
`out/` → Cloudflare Pages. This is deliberate: Fumadocs needs SSR for page data
(`createServerFn`/RSC), so it can't be *fully* SPA, but Next static export prerenders every
route (SSG) with browser-only Orama search — pure static, no worker, deploys clean to Pages.
(An earlier TanStack Start + nitro attempt fought workerd; Starlight was tried and dropped
for looking generic. Don't re-litigate — Fumadocs/Next static is the answer.)

- **Theme** (`app/global.css`): crisp black & white with the rehelios **marigold** as an
  accent only, mapped onto Fumadocs `--color-fd-*` tokens (light + dark). Fonts are
  **Bricolage Grotesque** + **Instrument Serif** (accent) via `next/font` in `app/layout.tsx`
  — don't reintroduce the Inter default (it silently overrode the CSS once).
- **Logo**: lucide `TvMinimalPlay`, monochrome (`components/logo.tsx`); favicon is a
  transparent, theme-aware SVG (`app/icon.svg`).
- **Landing**: `components/landing.tsx` (a client component) — hero, provider tabs, feature
  blocks with visual demos, capability matrix.
- **Docs content**: `content/docs/*.mdx` + `meta.json` (sidebar order + lucide icons). The
  docs page uses the clerk (threaded) TOC. Brand is **"Rehelios"** capitalized in prose/UI;
  code identifiers stay lowercase (`videos-sdk/rehelios`, `rehelios({...})`).
- **Analytics**: Umami, in `app/layout.tsx`.

## Publishing & CI

Exactly **two workflows**. Keep it that way.

- **CI** (`.github/workflows/ci.yml`): on push/PR — `bun install --frozen-lockfile`, lint,
  build, typecheck (both packages), SDK test. Read-only, no credentials.
- **Release** (`.github/workflows/release.yml`): on **push to `main`**, `tegami ci`.
  Tegami (`scripts/tegami.ts`) drafts changelog entries from the conventional commits since
  the last tag, bumps the version, writes `CHANGELOG.md` — and opens a **"Version Packages"
  PR** with that bump. Merging that PR runs the workflow again; now the repo version is
  ahead of npm, so Tegami publishes via **OIDC trusted publishing** (`id-token: write`, npm
  ≥ 11.5.1, automatic provenance) and creates the tag + GitHub Release. **So a release takes
  two merges: the change, then the Version Packages PR.**

**The release contract is the commit subject.** PRs are squash-merged, so the PR title *is*
the commit. `feat(videos-sdk):` → minor, `fix|perf|revert(videos-sdk):` → patch, `!` or a
`BREAKING CHANGE:` footer → major. Everything else (`chore:`, `docs:`, `ci:`) releases
nothing — and so does a **wrong scope**: `fix(ci):` or an unscoped `fix:` resolves to no
workspace package and is silently dropped. That silence is the sharpest edge here.

Non-obvious constraints, all learned the hard way:

- **The two-merge flow is forced by branch protection, not chosen.** `main` restricts pushes
  to a named user *and* requires the `check` status, and a commit the runner just created has
  neither — so `git push origin HEAD:main` from the release job dies with `GH006: Protected
  branch update failed`. The runner *can* push an unprotected branch, which is exactly what
  the Version Packages PR is. Setting `versionPr: false` and committing the bump straight to
  `main` is a one-merge release **and it cannot work as things stand** — it needs a pusher
  that bypasses protection: a GitHub App installed on the org (added to a repo ruleset's
  bypass list), a fine-grained PAT with `Contents: write`, or GitHub Team (org rulesets are a
  paid feature, and only there can `GitHub Actions` itself be a bypass actor — a *repo*
  ruleset rejects it with "must be part of the owner organization"). Get one of those and the
  one-merge flow is a three-line change.
- **The Version Packages PR has no CI run.** Tegami pushes its branch with `GITHUB_TOKEN`,
  and GitHub does not trigger workflows on `GITHUB_TOKEN` pushes (that is also what stops the
  release from looping). So the required `check` never appears on it — merge it as an admin.
- **Never `git add` only the package files.** `tegami version` also rewrites the workspace
  version inside `bun.lock`; leaving it out breaks the next `--frozen-lockfile` install.
- **`.tegami/changes/` is gitignored.** The drafted entries and `publish-lock.yaml` must
  never be committed — a committed pending lock makes the next `version` refuse to bump
  ("Publish lock is still pending"), which is exactly how `main` got wedged at 0.1.1.
- **Configure npm via `tegami({ npm })`, not `plugins: [npm(...)]`** — Tegami already
  prepends the npm provider, and registering it twice double-bumps every version.
- **Trusted publishing is bound to the workflow filename.** Renaming `release.yml` breaks
  publishing until it's reconfigured on npmjs.com. npm can't do the *first* publish of a new
  package this way; v0.1.0 was bootstrapped with `tegami npm pretrust`.
- No `RELEASE_TOKEN` exists, and the flow above is built so none is needed.
