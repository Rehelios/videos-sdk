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

Before opening a PR, run the same checks CI does:

```bash
bun run lint
bun run build
bun run typecheck
bun run test
```

## Making a change

1. Fork the repo and create a branch off `main` (e.g. `feat/signed-urls`).
2. Make your change, with tests where it makes sense.
3. Open a pull request, and **title it as a conventional commit** (see below).
4. [CodeRabbit](https://coderabbit.ai) reviews it automatically. Once it's approved and
   CI is green, a maintainer merges.

That's the whole contract. There's no changelog file to write and no release PR to
chase — the release notes come from your PR title and description.

## Your PR title is the release

We squash-merge, so **the PR title becomes the commit on `main`**, and that commit is
what decides whether a release happens and how big it is:

| PR title                             | Result                        |
| ------------------------------------ | ----------------------------- |
| `fix(videos-sdk): ...`               | patch release (`0.1.1` → `0.1.2`) |
| `feat(videos-sdk): ...`              | minor release (`0.1.1` → `0.2.0`) |
| `feat(videos-sdk)!: ...`             | major release (`0.1.1` → `1.0.0`) |
| `chore: ...`, `docs: ...`, `ci: ...` | no release                    |

Two rules:

- **Scope it `videos-sdk`** when the published package changes. An unscoped `fix: ...`,
  or a different scope like `fix(ci): ...`, publishes nothing.
- **Write a real PR description.** The squashed commit body becomes the `CHANGELOG.md`
  entry and the GitHub Release notes, so write it for a user of the SDK — what changed
  and why it matters, not how you implemented it.

Only `feat`, `fix`, `perf` and `revert` (plus anything marked breaking with `!` or a
`BREAKING CHANGE:` footer) trigger a release. Everything else is a no-op.

## How a release ships

Merging to `main` runs [`release.yml`](.github/workflows/release.yml). It reads the
conventional commits since the last tag, bumps the version, writes `CHANGELOG.md`, and
opens a **"Version Packages" PR** with that bump.

Merging *that* PR runs the workflow again: the version in the repo is now ahead of the one
on npm, so it publishes with
[provenance](https://docs.npmjs.com/generating-provenance-statements) via OIDC trusted
publishing and creates the git tag and GitHub Release. **A release is therefore two
merges** — your change, then the version bump. (The runner cannot commit to `main`
directly: the branch is protected, and a commit it just created has no `check` status.)

If no commit since the last tag was releasable, the job stops early and nothing ships.
Nobody cuts releases by hand.

## Maintainers: first-time npm setup

Already done for `videos-sdk` — kept here for reference.

npm trusted publishing has an egg-or-chicken problem: the package must exist before a
trusted publisher can be attached. [Tegami](https://tegami.fuma-nama.dev) solves it with
`npm pretrust`, which publishes a throwaway placeholder and configures trusted publishing
for `release.yml` in one shot. Run it **once**, locally:

```bash
npm login                          # a recent npm (>= 11.5.1) is required
bun scripts/tegami.ts npm pretrust # publish placeholder + configure trusted publishing
```

Trusted publishing is bound to the **workflow filename**. Renaming `release.yml` breaks
publishing until it's reconfigured on npmjs.com.

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
