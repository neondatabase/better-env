import { z } from "zod";
import { configSchema, server } from "./schema.ts";

export const mainConfig = configSchema("Main", {
  nodeEnv: server({
    env: "NODE_ENV",
    schema: z
      .enum(["development", "production", "test"])
      .default("development"),
  }),
});
