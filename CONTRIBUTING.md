# Contributing to videos-sdk

Thanks for your interest in improving **videos-sdk**! This document explains how to
set up the project, the change workflow, and how releases happen.

## Prerequisites

- [Bun](https://bun.sh) (the repo uses Bun workspaces and a `bun.lock`)
- Node.js 22+ (only needed for publishing; day-to-day work uses Bun)

## Setup

```bash
git clone https://github.com/Rehelios/videos-sdk.git
cd videos-sdk
bun install
```

The published package lives in `packages/videos-sdk`. Everything else is workspace
tooling and examples.

## Everyday commands

| Task      | Command             |
| --------- | ------------------- |
| Build     | `bun run build`     |
| Typecheck | `bun run typecheck` |
| Test      | `bun run test`      |
| Lint      | `bun run lint`      |
| Format    | `bun run format`    |

Please run `bun run lint`, `bun run typecheck`, and `bun run test` before opening a PR
— CI runs the same checks.

## Making a change

1. Fork the repo and create a branch off `main` (e.g. `feat/signed-urls`).
2. Make your change, with tests where it makes sense.
3. **Add a changelog entry** (see below) — this is how your change gets released.
4. Open a pull request. A bot will comment a **release preview** showing what your
   change will publish.

## Changelog entries (how releases are versioned)

We use [Tegami](https://tegami.fuma-nama.dev) — a Changesets-style tool — to manage
versioning and publishing. Every user-facing change should ship with a changelog
entry so the version bump and release notes are generated automatically.

Add one interactively:

```bash
bun run release
```

Pick the package (`videos-sdk`), choose the bump type, and write the note:

- **patch** — bug fixes, docs, internal changes with no API impact
- **minor** — new, backwards-compatible features (new adapter, new capability)
- **major** — breaking API changes

This creates a small Markdown file under `.tegami/changes/`. **Commit it with your
PR.** If a change is purely internal (CI, tests, refactor with no user impact) you can
skip the entry.

> AI agents: see [`AGENTS.md`](./AGENTS.md) for the exact changelog file format.

## How a release ships

You don't cut releases by hand:

1. When your PR merges to `main`, Tegami opens (or updates) a **"Version Packages"**
   PR that bumps versions and updates `CHANGELOG.md` from the pending entries.
2. When a maintainer merges that PR, the package is published to npm (via OIDC
   trusted publishing, with provenance) and a matching **GitHub Release + tag** is
   created automatically.

## Maintainers: first-time npm setup

npm trusted publishing has an egg-or-chicken problem — the package must exist before a
trusted publisher can be attached. Tegami solves it with `npm pretrust`, which publishes
a throwaway placeholder and configures trusted publishing for `release.yml` in one shot.
Run this **once**, locally:

```bash
npm login                          # a recent npm (>= 11.5.1) is required
bun run release                    # add a changelog entry (e.g. "Initial release")
bun scripts/tegami.ts version      # write the publish lock the next steps read
bun scripts/tegami.ts npm pretrust # publish placeholder + configure trusted publishing
```

After that, CI publishes real versions via OIDC — no npmjs.com UI, no manual publishes.
You can then drop the local version bump (`git checkout .`) and let the normal
Version Packages PR flow cut the first real release.

## Code style

Formatting and linting are handled by [Biome](https://biomejs.dev):

```bash
bun run format   # auto-fix
bun run lint     # check
```

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/Rehelios/videos-sdk/issues/new/choose).
For security issues, follow [`SECURITY.md`](./SECURITY.md) instead of opening a public
issue.

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
