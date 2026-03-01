# `better-env.ts` Config Reference

`better-env.ts` must default-export either:

- a full config (`defineBetterEnv({ ... })`), or
- an adapter instance (advanced; prefer full config)

## Minimal Example (Vercel)

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
});
```

## Fields

## `adapter` (required)

Adapter instance used for init/pull/env CRUD.

Vercel v1:

```ts
adapter: vercelAdapter();
```

## `gitignore.ensure` (default: `true`)

When `better-env pull` writes env files, ensure those paths are covered by `.gitignore`.

Disable only if you manage `.gitignore` elsewhere:

```ts
gitignore: {
  ensure: false;
}
```

## `environments` (optional)

Map local environment names to:

- `envFile`: local file to write
- `remote`: adapter-specific remote environment name, or `null` for local-only

Default mapping:

- `development`: `.env.development` ← remote `development`
- `preview`: `.env.preview` ← remote `preview`
- `production`: `.env.production` ← remote `production`
- `test`: `.env.test` ← local-only (`remote: null`)

For Vercel defaults, omit `environments` entirely.
Only define it when you need behavior different from defaults.

Important: `environments` is a full replacement, not a partial merge.
If you define it, include every local environment you plan to use.

Override example (custom behavior):

```ts
environments: {
  development: { envFile: ".env", remote: "development" },
  preview: { envFile: ".env.preview", remote: "preview" },
  production: { envFile: ".env.production", remote: "production" },
  test: {
    envFile: ".env.test",
    remote: null,
    ignoreUnused: ["A_PROVIDER_PROVIDED_ENV_VAR"],
  },
}
```
