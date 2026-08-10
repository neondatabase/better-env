# better-env

A runtime + CLI to sync local `.env` files with remote providers (Vercel, Netlify, Railway, Cloudflare, Fly.io, Convex) and validate typed env configs.

## Dev environment

- Use bun as the package manager and to run `package.json` scripts (`bun install`, `bun run <script>`). `bun.lock` is the source of truth; stray `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` files are gitignored.
- Tests run under Bun's built-in runner (`bun test`). Live provider e2e tests are gated behind `BETTER_ENV_REAL_<PROVIDER>_E2E=1` so the default `bun test` run does not hit real cloud accounts.
- [Fallow](https://github.com/fallow-rs/fallow) is a local dev dependency (`bun run fallow`). It reports unused code, duplication, and complexity across the repo; fix what matters locally and ignore noise when appropriate. It does not run in GitHub Actions.
- **Dependabot is off, deliberately.** It cannot open a mergeable PR here for two independent reasons: it edits `package.json` without touching `bun.lock`, so CI fails at `bun install --frozen-lockfile`; and the apps under `examples/` depend on the package as `"better-env": "link:better-env"`, which npm rejects with `EUNSUPPORTEDPROTOCOL` before the update job can start. Security **alerts** are still on and still show in the Security tab — only the automatic pull requests are disabled. Bump dependencies by hand with `bun update`, which maintains the lockfile. Re-enabling Dependabot without bun lockfile support just restores a permanently red Actions tab.

## Changelog

`CHANGELOG.md` is for **user-facing** changes only: new features and bug fixes that affect people using `better-env` (CLI commands, adapter behaviour, runtime API). Skip internal-only work (tooling, CI, dev dependencies, refactors with no behaviour change). When you ship something that belongs in the changelog, add an entry in the same tone as existing ones and bump `package.json` per semver—often one entry + bump per release batch.

## Dev and PR workflow

1. **Branch from up-to-date `main`** — `git checkout main && git pull`.
2. **Implement the change** — keep the diff focused; match existing style and patterns. Adapter-specific code lives under `src/lib/adapters/<provider>.ts` and is paired with a runtime e2e test under `test/e2e/runtime-<provider>.test.ts` that uses a fake CLI binary in `test/bin/<provider>/`.
3. **Tests** — add or extend tests so behavior and edge cases are covered by the spec. Prefer **e2e tests without mocks**: for adapters, fake the provider CLI via a script in `test/bin/<provider>/` and exercise the runtime through `bun test test/e2e/runtime-<provider>.test.ts`. Live provider tests (`test/e2e/<provider>-live.test.ts`) require an authenticated CLI and the `BETTER_ENV_REAL_<PROVIDER>_E2E=1` env flag.
4. **Typecheck** — `bun run typecheck` (`src/` + `test/`); fix all reported issues. The apps under `examples/` are standalone projects with their own tsconfig and are not covered.
5. **Tests** — `bun test`; fix failures. Live e2e tests are intentionally not part of the default run.
6. **Quality pass** — run `bun run fmt`, then `bun run build`, `bun run typecheck`, and `bun test` again so formatting, build, types, and tests are all green.
7. **Fallow** — `bun run fallow` (or `bun run fallow -- --summary`). Address findings that are clearly worth it; not every Fallow warning needs a code change.
8. **Release notes** — if the change is user-facing (feature or bug fix), add a short `CHANGELOG.md` entry and bump `package.json` per semver; otherwise skip the changelog.
9. **README** — update only if end users need to know about a new or changed feature.
10. **PR** — push your branch and open a pull request against `main`.

CI runs format check, typecheck, the default `bun test` suite (runtime adapter e2e + unit), and build. Keep local runs of the full `bun test` script green before you rely on CI.

## Releasing

`better-env` ships through a locked-down GitHub Actions pipeline using npm Trusted Publishing (OIDC), provenance attestation, and `npm stage publish` with WebAuthn-gated maintainer approval. **There is no supported `npm publish` from a laptop.** See [docs/RELEASING.md](docs/RELEASING.md) for the one-time setup checklist, per-release runbook, and break-glass procedure.
