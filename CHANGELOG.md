# Changelog

## 0.2.0 - 2026-02-18

- `better-env init` now bootstraps `better-env.ts` when missing with an adapter selection prompt.
- Adapter selection is prefilled from project markers (`.vercel`, `.netlify`, `.railway`, `wrangler.toml`/`.wrangler`, `fly.toml`, `convex/`, `convex.json`).
- `better-env init --yes` is now non-interactive and auto-selects the inferred provider (fallback: Vercel).
- Added a new `convexAdapter` with support for `init`, `pull`, `add`, `upsert`, `update`, `delete`, environment listing, and `load --replace`.
- Added Convex runtime e2e coverage with a fake CLI binary (`test/e2e/runtime-convex.test.ts`).
- Added Convex package/build exports and README documentation.
- Example-only Netlify React Router files now use `// @ts-nocheck` to keep workspace-level typecheck stable.
