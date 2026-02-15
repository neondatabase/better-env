import { configSchema, pub, server } from "better-env/config-schema";
import { z } from "zod";

export const siteConfig = configSchema("Site", {
  appName: pub({
    env: "NEXT_PUBLIC_APP_NAME",
    value: process.env.NEXT_PUBLIC_APP_NAME,
    schema: z.string().default("Better Env Demo"),
  }),
  apiBaseUrl: server({
    env: "API_BASE_URL",
    optional: true,
  }),
});
