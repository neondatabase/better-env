import { siteConfig } from "./src/lib/site/config";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/": () => {
      const body = [
        "# better-env + Railway Bun Demo",
        "",
        `PUBLIC_APP_NAME=${siteConfig.public.appName}`,
        `API_BASE_URL=${siteConfig.server.apiBaseUrl ?? "(not configured)"}`,
      ].join("\n");

      return new Response(body, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    },
  },
});

console.log(`Listening on http://localhost:${server.port}`);
