# better-env CLI Reference

## Global Options

- `--cwd <dir>`: run against a different project directory
- `--environment <name>` / `-e <name>`: select an environment (defaults to `development`)
- `--yes` / `-y`: skip prompts (only used by `init` today)

## Commands

## `better-env init`

Initialize the adapter for the current project.

Vercel adapter:

- Checks `vercel --version`
- Ensures `.vercel/project.json` exists (runs `vercel link` if not)

## `better-env pull`

Pull the latest remote env vars and write to the configured env file for the selected environment.

Example:

```bash
better-env pull --environment preview
```

## `better-env add|upsert|update <key> <value>`

Create/change a single remote env var:

- `add`: fail if key exists
- `update`: fail if key does not exist
- `upsert` (default style): set regardless of existence

Options:

- `--sensitive`: mark as sensitive (adapter-dependent; Vercel uses `--sensitive`)

Example:

```bash
better-env upsert API_URL https://example.com --environment preview
```

Secret example:

```bash
better-env upsert DB_URL "<secret>" --environment development --sensitive
```

## `better-env delete <key>`

Delete a remote env var.

Example:

```bash
better-env delete OLD_API_KEY --environment production
```

## `better-env load <file>`

Apply a dotenv file to remote env vars.

Options:

- `--mode add|update|upsert|replace` (default: `upsert`)
- `--add | --update | --upsert | --replace` (mode aliases)
- `--sensitive`

Notes:

- `--replace` requires the adapter to support listing env vars (Vercel does) and will delete keys that are not present in the file.

Example:

```bash
better-env load .env.production --environment production --replace
```

## `better-env validate`

Run env validation for `src/lib/*/config.ts` configs using Next.js env loading semantics.

Example:

```bash
better-env validate --environment development
```

## Common Env Workflows

Missing env var locally:

```bash
better-env pull --environment development
bun run dev
better-env validate --environment development
```

User provided a new env var value:

```bash
better-env upsert DB_URL "<value>" --environment development --sensitive
better-env pull --environment development
better-env validate --environment development
```

## `better-env environments list`

List adapter-supported remote environments.

Vercel: `development`, `preview`, `production`.
