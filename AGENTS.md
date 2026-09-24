# Working on Meadow

## Concurrent tasks

- The source of truth is `MalikElate/podcast-clipper`, branch `main`.
- Give each coding task its own Git worktree and unique `codex/` branch based on freshly fetched `origin/main`. Do not share a working directory between active tasks, even when their intended files differ. Reuse only a worktree exclusively owned by this task.
- Inspect `git status` and `git worktree list` before edits. Preserve unfamiliar changes; do not stash, reset, clean, switch branches, or overwrite another task's work.
- Apply small, scoped patches. Never replace a current source file with a full copy from an older clone. When two tasks touch the same behavior, coordinate their scope and reconcile both outcomes before merging.
- Before final validation, fetch and integrate current `origin/main`. Review `git diff origin/main...HEAD` for changes that undo another task. A merge without textual conflicts can still introduce a behavior regression, so check the combined result.
- Submit a pull request. Main requires the `Tests and build` check and an up-to-date branch. If another PR merges first, integrate main and let checks rerun. Use the expected head SHA when merging. Do not push directly to main, force-push main, or bypass branch protection.
- Prefer merging main into an already published feature branch rather than rewriting shared history. Never overwrite another task's branch.

## Validation

Use Node 22.12 or newer in the Node 22 series and FFmpeg/ffprobe. Install locked dependencies in the root, frontend, and backend. The CI workflow runs:

```sh
npm test --prefix frontend
npm test --prefix backend
npm run build --prefix frontend
```

Public frontend changes should also be checked at desktop and phone widths. Preserve the current design and read `docs/design-guide.md` when changing UI. Do not use live social posts, purchases, or account disconnections as routine tests.

## Releases

Production code releases run through Cloudflare Workers Builds after a PR merges into main. See `docs/deployment.md`. Do not run a production Wrangler deploy from a feature branch or stale clone. A local build or successful merge is not proof of deployment: verify the Cloudflare check for the merge commit and the relevant live behavior. If newer main commits supersede the build, verify the latest cumulative deployment rather than redeploying an older commit.

Do not replace the existing deployment pipeline or alter production secrets to work around an integration conflict. Keep parallel implementation separate from the shared release path.
