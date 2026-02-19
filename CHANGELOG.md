# Changelog

## 0.2.0 - 2026-02-18

- `better-env init` now bootstraps `better-env.ts` when missing with an adapter selection prompt.
- Adapter selection is prefilled from project markers (`.vercel`, `.netlify`, `.railway`, `wrangler.toml`/`.wrangler`, `fly.toml`).
- `better-env init --yes` is now non-interactive and auto-selects the inferred provider (fallback: Vercel).
