<!--
Thanks for contributing to videos-sdk! See CONTRIBUTING.md for the full workflow.

We squash-merge, so THIS PR's title becomes the commit on `main` — and that is what
decides whether a release ships:

  fix(videos-sdk): ...      -> patch release
  perf(videos-sdk): ...     -> patch release
  revert(videos-sdk): ...   -> patch release
  feat(videos-sdk): ...     -> minor release
  feat(videos-sdk)!: ...    -> major release  (the `!` works on any of the above,
  fix(videos-sdk)!: ...     -> major release   as does a `BREAKING CHANGE:` footer)
  chore: / docs: / ci: ...  -> no release

Only `feat`, `fix`, `perf` and `revert` release anything, and only when scoped to
`videos-sdk`. An unscoped `fix: ...` — or a wrong scope like `fix(ci): ...` — resolves
to no workspace package and silently publishes nothing.
-->

## What & why

<!--
What does this PR change, and why? Link any related issue: Closes #123

This becomes the CHANGELOG.md entry and the GitHub Release notes, so write it for
someone using the SDK: what changed and why it matters.
-->

## Checklist

- [ ] The PR title is a conventional commit, scoped `videos-sdk` if the package changed
- [ ] `bun run lint` · `bun run build` · `bun run typecheck` · `bun run test` all pass
- [ ] Updated docs / README if behavior or the API changed
