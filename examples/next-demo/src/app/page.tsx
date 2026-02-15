import { siteConfig } from "../lib/site/config";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
        better-env + Vercel Demo
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">
        {siteConfig.public.appName}
      </h1>
      <p className="text-lg text-zinc-600">
        This value comes from <code>NEXT_PUBLIC_APP_NAME</code> synced with
        Vercel by <code>better-env</code>.
      </p>
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <span className="font-semibold">Optional API_BASE_URL:</span>{" "}
        {siteConfig.server.apiBaseUrl ?? "(not configured)"}
      </p>
    </main>
  );
}
