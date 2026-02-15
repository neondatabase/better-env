import { defineBetterEnv, vercelAdapter } from "better-env";

export default defineBetterEnv({
  adapter: vercelAdapter(),
});
