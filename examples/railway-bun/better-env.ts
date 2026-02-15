import { defineBetterEnv, railwayAdapter } from "better-env";

export default defineBetterEnv({
  adapter: railwayAdapter({ service: "app" }),
});
