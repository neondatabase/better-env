import { defineBetterEnv, netlifyAdapter } from "better-env";

export default defineBetterEnv({
  adapter: netlifyAdapter(),
});
