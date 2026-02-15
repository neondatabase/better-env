---
name: better-env
description: Operate and integrate the better-env runtime + CLI (sync local .env files from Vercel before running commands), manage remote environment variables (add/upsert/update/delete/load), configure better-env via better-env.ts, and use configSchema + env validation utilities to catch missing/invalid env vars early.
---

# better-env

## Work With better-env In A Repo

1. Find (or create) `better-env.ts` at the project root.
2. Ensure `runtime.devCommand` is set (required for `better-env dev`).
3. Run `better-env init` once to confirm the adapter is set up (Vercel: linked project).
4. Use `better-env dev` or `better-env run -- <cmd...>` as the default entrypoint locally.

If you need details, read:

- `references/config.md` for the config schema and defaults
- `references/runtime.md` for the runtime behavior and recommended workflow
- `references/cli.md` for the full command matrix

## Configure `better-env.ts`

Use a default export. Minimal example (Vercel):

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
  runtime: {
    devCommand: ["next", "dev"],
  },
});
```

Customize environments (env file targets + remote mapping) and gitignore behavior in the config. See `references/config.md`.

## Run With Synced Env

- Prefer `better-env dev` for local dev.
- Use `better-env run -- <cmd...>` to wrap any command (migrations, scripts, etc.).
- Use `better-env pull` to only sync env files without running a command.

The runtime writes the configured env file (defaults: `.env.development`, `.env.preview`, `.env.production`) and never overwrites `.env.local`.

## Manage Remote Env Vars

Use a consistent, idempotent workflow:

- Prefer `better-env upsert KEY VALUE` for scripts/automation.
- Use `better-env add` when you want failures if the key already exists.
- Use `better-env update` when you want failures if the key does not exist.
- Use `better-env delete KEY` to remove a key.

For batch updates, use `better-env load <file> --mode upsert|add|update|replace`.

Adapter-specific details (Vercel CLI translation) live in `references/vercel-adapter.md`.

## Validate Env Configs

If a codebase uses the `configSchema` pattern (configs in `src/lib/*/config.ts`), run:

```bash
better-env validate --environment development
```

This loads `.env*` files using Next.js semantics, imports each `src/lib/*/config.ts`, and fails fast on missing/invalid env vars. See `references/env-validation.md`.

## Troubleshoot Quickly

1. If `better-env init` fails on Vercel: ensure `vercel` CLI is installed and the repo is linked (`.vercel/project.json` exists). Re-run `better-env init`.
2. If env values look stale: run `better-env pull --environment <name>` and confirm the target env file changed.
3. If secrets appear in git status: ensure the env file is covered by `.gitignore` (or `gitignore.ensure` is enabled). See `references/runtime.md`.
