# Runtime Behavior Reference

`better-env` is designed to be the local entrypoint for commands that need env vars.

## How `dev` / `run` Work

1. Load `better-env.ts` (walk up from `--cwd` until found).
2. Resolve the selected environment (default: `development`).
3. Pull remote env vars into the configured local env file (unless `remote: null`).
4. Ensure that env file is ignored by git (unless `gitignore.ensure: false`).
5. Execute the command (`runtime.devCommand` for `dev`, or the `-- <cmd...>` for `run`).

## Env File Strategy (Next.js/Vercel)

Recommended pattern:

- `.env.development`: shared values pulled from Vercel
- `.env.local`: local-only overrides (never written by better-env)

Keep `.env.local` out of Vercel sync to prevent local changes from being overwritten.

## Gitignore Guard

When enabled, the runtime ensures the target env file is covered by `.gitignore`.

- If `.gitignore` is missing, it is created.
- Entries are appended under a `# better-env (generated)` header.

Disable if you want strict control:

```ts
gitignore: {
  ensure: false;
}
```
