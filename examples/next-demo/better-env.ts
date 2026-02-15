import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
  runtime: {
    devCommand: ["bun", "run", "dev:next"],
  },
});
