# Vercel Adapter Reference (v1)

The Vercel adapter uses the Vercel CLI (not the API directly). This keeps auth/teams/project linking aligned with how most teams already work.

## Requirements

- `vercel` must be available in `$PATH` (or configure `vercelAdapter({ vercelBin: "..." })`)
- The project directory must be linked to a Vercel project (`.vercel/project.json`)

## How Commands Translate

## `better-env init`

- `vercel --version`
- if missing `.vercel/project.json`: `vercel link` (interactive unless `--yes`)

## `better-env pull`

- `vercel env pull <envFile> --environment <development|preview|production> --yes`

## `better-env add`

- `vercel env add <KEY> <environment> [--sensitive]`
- Pass value via stdin

## `better-env upsert`

- `vercel env add <KEY> <environment> --force [--sensitive]`
- Pass value via stdin

## `better-env update`

- `vercel env ls <environment>` to confirm existence
- then uses the same flow as `upsert`

## `better-env delete`

- `vercel env rm <KEY> <environment> --yes`

## Environments

The adapter supports the Vercel default environments:

- `development`
- `preview`
- `production`

Creating/deleting environments is not supported (Vercel environments are fixed).
