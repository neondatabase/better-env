import type { Route } from "./+types/home";
import { siteConfig } from "../lib/site/config";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "better-env + Netlify React Router Demo" },
    {
      name: "description",
      content: "Server-side env values loaded via React Router loader",
    },
  ];
}

export function loader() {
  return {
    appName: siteConfig.public.appName,
    apiBaseUrl: siteConfig.server.apiBaseUrl ?? "(not configured)",
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const data = loaderData;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
        better-env + Netlify React Router Demo
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">{data.appName}</h1>
      <p className="text-lg text-zinc-600">
        This value comes from <code>PUBLIC_APP_NAME</code> loaded on the server
        with a React Router <code>loader</code> and synced to Netlify by{" "}
        <code>better-env</code>.
      </p>
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <span className="font-semibold">Optional API_BASE_URL:</span>{" "}
        {data.apiBaseUrl}
      </p>
    </main>
  );
}
