# Changelog

## 0.3.0 - 2026-02-19

- Added per-environment `ignoreUnused` support in `better-env.ts` so `better-env validate` can suppress specific unused dotenv keys per local environment.
- Added adapter-level default unused-ignore support.
- Vercel adapter now ignores `VERCEL_OIDC_TOKEN` by default for `development`, `preview`, and `production` validation runs.
- `better-env validate` now uses `better-env.ts` when available to merge adapter defaults with env-specific `ignoreUnused` values.

## 0.2.0 - 2026-02-18

- `better-env init` now bootstraps `better-env.ts` when missing with an adapter selection prompt.
- Adapter selection is prefilled from project markers (`.vercel`, `.netlify`, `.railway`, `wrangler.toml`/`.wrangler`, `fly.toml`, `convex/`, `convex.json`).
- `better-env init --yes` is now non-interactive and auto-selects the inferred provider (fallback: Vercel).
- Added a new `convexAdapter` with support for `init`, `pull`, `add`, `upsert`, `update`, `delete`, environment listing, and `load --replace`.
- Added Convex runtime e2e coverage with a fake CLI binary (`test/e2e/runtime-convex.test.ts`).
- Added Convex package/build exports and README documentation.
- Example-only Netlify React Router files now use `// @ts-nocheck` to keep workspace-level typecheck stable.
