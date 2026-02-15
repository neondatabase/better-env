# better-env Next.js Demo

This app demonstrates `better-env` with a real Vercel project.

## Prerequisites

- `bun`
- `vercel` CLI authenticated (`vercel whoami`)

## Install

Register the local package from repo root:

```bash
bun link
```

Then install from this folder:

```bash
bun install
```

## Configure a Vercel project

Create and link a project:

```bash
vercel project add <your-project-name>
vercel link --yes --project <your-project-name>
```

## Use better-env

```bash
bun run env:init
better-env add NEXT_PUBLIC_APP_NAME "Better Env Demo" --environment development
bun run env:validate
```

`bun run dev` is configured to run through `better-env` (it pulls env vars and
then starts Next.js).

Run the full CLI verification matrix:

```bash
bun run env:verify
```

Then run the app:

```bash
bun run dev
```

The page reads `NEXT_PUBLIC_APP_NAME` via `src/lib/site/config.ts` and renders it.
