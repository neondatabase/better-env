export type ValidateEnvOptions = {
  /**
   * NODE_ENV to validate against (affects Next.js env loading semantics).
   * Default: process.env.NODE_ENV ?? "development"
   */
  environment?: string;
  /**
   * Project root directory (where .env* and src/ live).
   * Default: process.cwd()
   */
  projectDir?: string;
};
