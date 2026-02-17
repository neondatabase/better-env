import { defineBetterEnv, flyAdapter } from "better-env";

export default defineBetterEnv({
  adapter: flyAdapter({ app: process.env.BETTER_ENV_FLY_APP }),
});
