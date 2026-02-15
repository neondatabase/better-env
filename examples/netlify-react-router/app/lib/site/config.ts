import { configSchema, pub, server } from "better-env/config-schema";
import { z } from "zod";

export const siteConfig = configSchema("Site", {
  appName: pub({
    env: "PUBLIC_APP_NAME",
    value: process.env.PUBLIC_APP_NAME,
    schema: z.string().default("Better Env Netlify Demo"),
  }),
  apiBaseUrl: server({
    env: "API_BASE_URL",
    optional: true,
  }),
});
