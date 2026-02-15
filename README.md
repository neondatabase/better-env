# better-env

`better-env` is a bun-first runtime + CLI for keeping local `.env*` files in sync with a remote provider (v1: Vercel), plus the env utilities from `fullstackrecipes` (config schema + env validation).

## What You Get (v1)

- `better-env run -- <cmd>`: pull latest env vars, ensure gitignore, then run a command
- `better-env init`: verify `vercel` is installed and the project is linked (`.vercel/project.json`)
- `better-env add|upsert|update|delete`: manage remote env vars
- `better-env load <file> --mode upsert|add|update|replace`: apply a dotenv file to remote env vars
- `better-env validate`: pre-run env validation for Next.js-style projects (imports `src/lib/*/config.ts`)
- `configSchema` utility: a typed env-schema helper (`server()` / `pub()` / flags / `oneOf`)

## Requirements

- `bun`
- Vercel adapter only: `vercel` CLI available in `$PATH` (or set `vercelBin` in config)

## Setup

Create `better-env.ts` in your project root:

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
  runtime: {
    // Used by `better-env dev`
    devCommand: ["next", "dev"],
  },
});
```

Then:

```bash
better-env init
better-env pull
better-env run -- next dev
```

If you want the nicest workflow, use:

```bash
better-env dev
```

## Environments

By default, `better-env` provides these environment names:

- `development` → writes `.env.development`, pulls from Vercel `development`
- `preview` → writes `.env.preview`, pulls from Vercel `preview`
- `production` → writes `.env.production`, pulls from Vercel `production`
- `test` → writes `.env.test`, local-only (no remote mapping)

You can override (or add) environments in `better-env.ts`:

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
  environments: {
    development: { envFile: ".env.development", remote: "development" },
    preview: { envFile: ".env.preview", remote: "preview" },
    production: { envFile: ".env.production", remote: "production" },
    test: { envFile: ".env.test", remote: null },
  },
});
```

`better-env` never writes to `.env.local` (use it as your local override).

## Commands

```bash
better-env init [--yes]
better-env pull [--environment <name>]
better-env dev [--environment <name>]
better-env run [--environment <name>] -- <command...>

better-env add <key> <value> [--environment <name>] [--sensitive]
better-env upsert <key> <value> [--environment <name>] [--sensitive]
better-env update <key> <value> [--environment <name>] [--sensitive]
better-env delete <key> [--environment <name>]

better-env load <file> [--environment <name>] [--mode add|update|upsert|replace] [--sensitive]
better-env environments list
```

## Skills (For Coding Agents)

Install the `better-env` Codex/Cursor skill from this repo:

```bash
npx skills add neondatabase/better-env
# or (recommended, explicit):
npx skills add neondatabase/better-env --skill better-env -a codex -a cursor
```

## Env Validation (from fullstackrecipes)

If your app uses the `configSchema` pattern (configs in `src/lib/*/config.ts`), you can validate env vars pre-build:

```bash
better-env validate --environment development
```

## Config Schema Utility (from fullstackrecipes)

```ts
import { configSchema, server, pub } from "better-env/config-schema";

export const sentryConfig = configSchema(
  "Sentry",
  {
    token: server({ env: "SENTRY_AUTH_TOKEN" }),
    dsn: pub({
      env: "NEXT_PUBLIC_SENTRY_DSN",
      value: process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  },
  {
    flag: {
      env: "NEXT_PUBLIC_ENABLE_SENTRY",
      value: process.env.NEXT_PUBLIC_ENABLE_SENTRY,
    },
  },
);
```
