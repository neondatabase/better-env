# better-env

Better environment variable management for agents and humans with full type safety, CLI-based remote environment synchronization and validation.

## Introduction

Don't you hate it when your production build fails because you forgot to upload a new env var to your hosting provider? Isn't it super furstrating when your on another machine and you want to work on your app only to realize your env variables are not up to date or missing? I think we deserve a better way. Enter `better-env`.

`better-env` is a toolkit for environment and runtime configuration management, including:

- `config-schema` for typed env declarations
- a CLI for remote variable operations
- provider adapters to sync local dotenv files with hosted platforms (Vercel, Netlify, Railway, Cloudflare, and Fly.io)

## Setup

### 1) Install the coding agent skill

Install the `better-env` skill first so coding agents can apply the recommended conventions and workflows:

```bash
npx skills add neondatabase/better-env
```

### 2) Add typed config modules for environment variables

Use `better-env/config-schema` to define typed config objects. This gives runtime validation and typed access for both server and public values.

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

Best practice: keep one `config.ts` per feature or infrastructure service.

- `src/lib/auth/config.ts`
- `src/lib/database/config.ts`
- `src/lib/sentry/config.ts`

This keeps ownership clear and allows validation to discover config declarations consistently.

### 3) Add and run environment validation

If your project follows the `config.ts` convention, you can use the `better-env validate` command to validate your current app enviornment against your application's config schemas.

```json
{
  "scripts": {
    "env:validate": "better-env validate --environment development",
    "dev": "npm run env:validate && next dev",
    "build": "better-env validate --environment production && next build"
  }
}
```

## Remote Environment Management

If you're using a supported hosting provider, you can use the `better-env` CLI to manage your remote environment variables and keep your local dotenv files in sync.

### Requirements

- Provider CLI available in `$PATH`
  - Vercel adapter: `vercel` (or set `vercelBin`)
  - Netlify adapter: `netlify` (or set `netlifyBin`)
  - Railway adapter: `railway` (or set `railwayBin`)
  - Cloudflare adapter: `wrangler` (or set `wranglerBin`)
  - Fly adapter: `fly` (or set `flyBin`)

### Configure `better-env.ts`

Create `better-env.ts` in your project root:

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
});
```

Netlify example:

```ts
import { defineBetterEnv, netlifyAdapter } from "better-env";

export default defineBetterEnv({
  adapter: netlifyAdapter(),
});
```

Cloudflare Workers example:

```ts
import { cloudflareAdapter, defineBetterEnv } from "better-env";

export default defineBetterEnv({
  adapter: cloudflareAdapter(),
});
```

Railway example:

```ts
import { defineBetterEnv, railwayAdapter } from "better-env";

export default defineBetterEnv({
  adapter: railwayAdapter(),
});
```

Fly.io example:

```ts
import { defineBetterEnv, flyAdapter } from "better-env";

export default defineBetterEnv({
  adapter: flyAdapter({
    app: process.env.BETTER_ENV_FLY_APP,
  }),
});
```

Run initial setup and first sync:

```bash
npx better-env init
npx better-env pull --environment development
```

## Environments

By default, `better-env` provides these environment names:

- `development` → writes `.env.development`, pulls from Vercel `development`
- `preview` → writes `.env.preview`, pulls from Vercel `preview`
- `production` → writes `.env.production`, pulls from Vercel `production`
- `test` → writes `.env.test`, local-only (no remote mapping)
- `local` → writes `.env.local`, local-only (no remote mapping)

For Netlify adapter, the same local names map to:

- `development` → Netlify `dev`
- `preview` → Netlify `deploy-preview`
- `production` → Netlify `production`
- `test` → local-only (no remote mapping)

For Cloudflare adapter, the same local names map to Workers environments:

- `development` → Wrangler `--env development`
- `preview` → Wrangler `--env preview`
- `production` → Wrangler default environment (no `--env` flag)
- `test` → local-only (no remote mapping)

For Railway adapter, the same local names map to Railway environments by name:

- `development` → Railway `development`
- `preview` → Railway `preview`
- `production` → Railway `production`
- `test` → local-only (no remote mapping)

For Fly adapter, local names map to one Fly app secret store:

- `development` → Fly app secrets (single remote target)
- `preview` → Fly app secrets (single remote target)
- `production` → Fly app secrets (single remote target)
- `test` → local-only (no remote mapping)

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

Notes: `better-env` never writes to `.env.local` (use it as your local override).

### Cloudflare + better-env

- `better-env pull` is not supported for Cloudflare secrets (Wrangler cannot read back secret values).
- `wrangler dev` (local mode) does not inject remote secrets into local dotenv files so it's on you to keep your local env vars in sync with the remote environment. Or run `wrangler dev --remote` to use deployed environment bindings at runtime.
- Recommended workflow: keep local files (`.env.*` / `.dev.vars`) as source of truth, then push with `better-env load`.

### Fly + better-env

- `better-env pull` is not supported for Fly secrets (`fly secrets list` does not expose secret values).
- Set `BETTER_ENV_FLY_APP` or configure `flyAdapter({ app: "your-app-name" })`, unless your `fly.toml` already defines `app = "..."`
- Fly currently has one secret store per app, so `development`, `preview`, and `production` all target the same remote secret set by default.

## CLI Command Reference

- `init`: validates provider CLI availability and verifies project linkage when required (`.vercel/project.json` or `.netlify/state.json`)
- `pull`: fetches remote variables and ensures local `.gitignore` coverage
- `validate`: validates required variables by loading `config.ts` modules
- `add|upsert|update|delete`: applies single-variable mutations to the remote provider
- `load`: applies dotenv file contents using `add|update|upsert|replace` modes
- `environments list`: prints configured local/remote environment mappings

```bash
better-env init [--yes]
better-env pull [--environment <name>]
better-env validate [--environment <name>]

better-env add <key> <value> [--environment <name>] [--sensitive]
better-env upsert <key> <value> [--environment <name>] [--sensitive]
better-env update <key> <value> [--environment <name>] [--sensitive]
better-env delete <key> [--environment <name>]

better-env load <file> [--environment <name>] [--mode add|update|upsert|replace] [--sensitive]
better-env environments list
```

## Contribution

Run local checks:

```bash
npm run build
npm run typecheck
npm test
```

Run adapter e2e coverage:

- Live Vercel adapter test (creates and removes a real project):
  - Requires authenticated `vercel` CLI and project create/remove permissions
  - Run with `npm run test:e2e:vercel`
- Live Netlify adapter test (creates and removes a real project):
  - Requires authenticated `netlify` CLI and project create/remove permissions
  - Run with `npm run test:e2e:netlify`
- Live Railway adapter test (creates and removes a real project):
  - Requires authenticated `railway` CLI and project create/remove permissions
  - Optionally set `BETTER_ENV_RAILWAY_WORKSPACE=<workspace-id>` when multiple workspaces exist
  - Run with `npm run test:e2e:railway`
- Live Fly adapter test (creates and removes a real app):
  - Requires authenticated `fly` CLI and app create/remove permissions
  - Run with `npm run test:e2e:fly`
- Netlify adapter runtime e2e test (fake CLI binary):
  - Run with `bun test test/e2e/runtime-netlify.test.ts`
- Railway adapter runtime e2e test (fake CLI binary):
  - Run with `npm run test:e2e:railway:runtime`
- Cloudflare adapter runtime e2e test:
  - Run with `bun test test/e2e/runtime-cloudflare.test.ts`
- Fly adapter runtime e2e test:
  - Run with `npm run test:e2e:fly:runtime`
