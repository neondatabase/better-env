# Config Schema Utility Reference

The `configSchema` utility provides a typed, validated way to define env-backed config.

Key ideas:

- Use `server()` for server-only secrets (protected on client access via a Proxy).
- Use `pub()` for client-accessible values (requires passing `value` to preserve Next.js inlining).
- Use `flag` for feature toggles (`isEnabled`) and `oneOf()` for either-or credential validation.
- For secret env vars shared by a user (for example `DB_URL`), always use `server()` and never `pub()`.

## Example

```ts
import { configSchema, server, pub, oneOf } from "better-env/config-schema";

export const aiConfig = configSchema(
  "AI",
  {
    oidcToken: server({ env: "VERCEL_OIDC_TOKEN" }),
    gatewayApiKey: server({ env: "AI_GATEWAY_API_KEY" }),
    publicApiBase: pub({
      env: "NEXT_PUBLIC_API_BASE",
      value: process.env.NEXT_PUBLIC_API_BASE,
    }),
  },
  {
    flag: {
      env: "NEXT_PUBLIC_ENABLE_AI",
      value: process.env.NEXT_PUBLIC_ENABLE_AI,
    },
    constraints: (s) => [oneOf([s.oidcToken, s.gatewayApiKey])],
  },
);
```

## Common Patterns

## Parse/coerce values

```ts
import { z } from "zod";
import { configSchema, server } from "better-env/config-schema";

export const dbConfig = configSchema("DB", {
  poolSize: server({
    env: "DATABASE_POOL_SIZE",
    schema: z.coerce.number().default(10),
  }),
});
```

## Guard against client-side secret access

```ts
// On the client, accessing server-only values throws ServerConfigClientAccessError
dbConfig.server.poolSize;
```

## Defaults vs Optional

If you want a fallback value when the env var is missing, use a Zod default in the schema:

```ts
import { z } from "zod";
import { configSchema, pub } from "better-env/config-schema";

export const siteConfig = configSchema("Site", {
  appName: pub({
    env: "NEXT_PUBLIC_APP_NAME",
    value: process.env.NEXT_PUBLIC_APP_NAME,
    schema: z.string().default("Better Env Demo"),
  }),
});
```

Do not combine `optional: true` with a default when you need the default to apply on missing values, because optional fields may skip parsing when undefined.
