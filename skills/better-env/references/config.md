# `better-env.ts` Config Reference

`better-env.ts` must default-export either:

- a full config (`defineBetterEnv({ ... })`), or
- an adapter instance (advanced; prefer full config)

## Minimal Example (Vercel)

```ts
import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
  runtime: {
    devCommand: ["next", "dev"],
  },
});
```

## Fields

## `adapter` (required)

Adapter instance used for init/pull/env CRUD.

Vercel v1:

```ts
adapter: vercelAdapter();
```

## `runtime.devCommand` (recommended)

Command run by `better-env dev`.

Example:

```ts
runtime: {
  devCommand: ["bun", "run", "dev"];
}
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

Override example:

```ts
environments: {
  development: { envFile: ".env.development", remote: "development" },
  preview: { envFile: ".env.preview", remote: "preview" },
  production: { envFile: ".env.production", remote: "production" },
  test: { envFile: ".env.test", remote: null },
}
```
