# Release workflow

This repository uses [Tegami](https://tegami.fuma-nama.dev) for versioning and publishing,
driven entirely by **conventional commits**. There are no changelog files to author.

## What you need to do

Write the commit — or, if you are opening a pull request, the **PR title** — as a
conventional commit. We squash-merge, so the PR title is the commit that lands on `main`,
and it is the only thing that decides whether a release ships.

| Commit / PR title                    | Result                            |
| ------------------------------------ | --------------------------------- |
| `fix(videos-sdk): ...`               | patch release (`0.1.1` → `0.1.2`) |
| `feat(videos-sdk): ...`              | minor release (`0.1.1` → `0.2.0`) |
| `feat(videos-sdk)!: ...`             | major release (`0.1.1` → `1.0.0`) |
| `chore: ...`, `docs: ...`, `ci: ...` | no release                        |

Rules:

- Scope the commit `videos-sdk` when the published package changes. An unscoped
  `fix: ...`, or an unrelated scope like `fix(ci): ...`, **publishes nothing** — it is
  silently ignored at release time.
- Only `feat`, `fix`, `perf` and `revert` are releasable. Mark breaking changes with `!`
  after the scope, or a `BREAKING CHANGE:` footer in the body.
- The commit body becomes the `CHANGELOG.md` entry and the GitHub Release notes. Write it
  for someone using the SDK: what changed and why it matters, not how it was implemented.

## What you must not do

- Do not create files under `.tegami/changes/` — it is gitignored. Tegami drafts entries
  there from the commit log during the release run, and they never leave the runner.
- Do not edit `packages/videos-sdk/CHANGELOG.md`, the version in
  `packages/videos-sdk/package.json`, or the workspace version in `bun.lock`. The release
  workflow writes all three and commits them as `chore(release): videos-sdk@x.y.z`.
- Do not create git tags or GitHub Releases. `release.yml` does that on merge to `main`.
