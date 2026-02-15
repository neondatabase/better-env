# Env Validation Reference

`better-env validate` validates env-backed configs early by importing `src/lib/*/config.ts` files.

## What It Does

1. Load `.env*` files using Next.js semantics (`@next/env loadEnvConfig`)
2. Scan `src/lib/*/config.ts`
3. Import each config module to trigger `configSchema` validation
4. Report missing/invalid env vars
5. Warn about env vars defined in `.env*` files but not referenced by any config

## When To Use It

- Run in CI as a fast pre-check.
- Run locally before `next build` to catch missing secrets early.

## Example

```bash
better-env validate --environment development
```

Exit code:

- `1` if there are validation errors
- `0` otherwise (unused variables are warnings)
