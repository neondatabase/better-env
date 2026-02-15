export type BetterEnvEnvironmentName = string;

export type BetterEnvEnvironmentConfig = {
  /**
   * Local env file to write to (relative to the project root).
   * Example: ".env.development"
   */
  envFile: string;
  /**
   * Remote environment name for the adapter (if supported).
   * For Vercel this is one of: "development" | "preview" | "production".
   *
   * If null/undefined, the environment is treated as local-only (no pull/push).
   */
  remote?: string | null;
};

export type BetterEnvLoadMode = "add" | "update" | "upsert" | "replace";

export type BetterEnvConfig = {
  adapter: BetterEnvAdapter;
  /**
   * Optional environment map. If omitted, a sensible default is used:
   * development/preview/production map to Vercel envs and write to
   * `.env.development`, `.env.preview`, `.env.production`. A local-only `test`
   * env writes to `.env.test`.
   */
  environments?: Record<BetterEnvEnvironmentName, BetterEnvEnvironmentConfig>;
  gitignore?: {
    /**
     * When pulling and writing env files, ensure they are ignored by git.
     * Default: true
     */
    ensure?: boolean;
  };
};

export type BetterEnvAdapter = {
  name: string;
  init: (
    ctx: BetterEnvAdapterContext,
    options: { yes: boolean },
  ) => Promise<void>;
  pull: (
    ctx: BetterEnvAdapterContext,
    options: { environment: string; envFile: string },
  ) => Promise<void>;
  add: (
    ctx: BetterEnvAdapterContext,
    options: {
      environment: string;
      key: string;
      value: string;
      sensitive: boolean;
    },
  ) => Promise<void>;
  upsert: (
    ctx: BetterEnvAdapterContext,
    options: {
      environment: string;
      key: string;
      value: string;
      sensitive: boolean;
    },
  ) => Promise<void>;
  update: (
    ctx: BetterEnvAdapterContext,
    options: {
      environment: string;
      key: string;
      value: string;
      sensitive: boolean;
    },
  ) => Promise<void>;
  delete: (
    ctx: BetterEnvAdapterContext,
    options: { environment: string; key: string },
  ) => Promise<void>;
  listEnvironments: (ctx: BetterEnvAdapterContext) => Promise<string[]>;
  listEnvVars?: (
    ctx: BetterEnvAdapterContext,
    options: { environment: string },
  ) => Promise<string[]>;
};

export type BetterEnvAdapterContext = {
  projectDir: string;
  exec: Exec;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ExecOptions = {
  cwd: string;
  env?: Record<string, string>;
  stdin?: string;
  /**
   * When true, inherit stdio for interactive commands.
   */
  interactive?: boolean;
};

export type Exec = (cmd: string[], options: ExecOptions) => Promise<ExecResult>;
