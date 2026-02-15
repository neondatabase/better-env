import { z } from "zod";

// =============================================================================
// Types
// =============================================================================

/** Base field definition with schema type */
type FieldDefBase<TSchema extends z.ZodTypeAny = z.ZodString> = {
  env: string;
  value: string | undefined;
  schema: TSchema;
  isOptional: boolean;
};

/** Server field definition */
type ServerFieldDef<TSchema extends z.ZodTypeAny = z.ZodString> =
  FieldDefBase<TSchema> & { _type: "server" };

/** Public field definition */
type PublicFieldDef<TSchema extends z.ZodTypeAny = z.ZodString> =
  FieldDefBase<TSchema> & { _type: "public" };

/** Field definition union */
type FieldDef = ServerFieldDef<z.ZodTypeAny> | PublicFieldDef<z.ZodTypeAny>;

/** Schema fields record */
type SchemaFields = Record<string, FieldDef>;

/** Constraint result */
type ConstraintResult<T extends SchemaFields> = {
  type: "oneOf";
  fields: (keyof T)[];
  satisfied: boolean;
};

/** Constraint function */
type Constraint<T extends SchemaFields> = (fields: T) => ConstraintResult<T>;

/** Infer the output type from a FieldDef based on schema and optionality */
type InferField<F> =
  F extends FieldDefBase<infer S>
    ? F["isOptional"] extends true
      ? z.infer<S> | undefined
      : z.infer<S>
    : never;

/** Extract server field keys */
type ServerKeys<T extends SchemaFields> = {
  [K in keyof T]: T[K] extends ServerFieldDef<z.ZodTypeAny> ? K : never;
}[keyof T];

/** Extract public field keys */
type PublicKeys<T extends SchemaFields> = {
  [K in keyof T]: T[K] extends PublicFieldDef<z.ZodTypeAny> ? K : never;
}[keyof T];

/** Build server section type */
type ServerSection<T extends SchemaFields> = {
  [K in ServerKeys<T>]: InferField<T[K]>;
};

/** Build public section type */
type PublicSection<T extends SchemaFields> = {
  [K in PublicKeys<T>]: InferField<T[K]>;
};

/** Check if there are any server fields */
type HasServerFields<T extends SchemaFields> =
  ServerKeys<T> extends never ? false : true;

/** Check if there are any public fields */
type HasPublicFields<T extends SchemaFields> =
  PublicKeys<T> extends never ? false : true;

/** Infer config result from fields (no isEnabled) */
type InferConfigResult<T extends SchemaFields> =
  (HasServerFields<T> extends true ? { server: ServerSection<T> } : object) &
    (HasPublicFields<T> extends true ? { public: PublicSection<T> } : object);

/** Config with feature flag enabled */
type EnabledConfig<T extends SchemaFields> = InferConfigResult<T> & {
  isEnabled: true;
};

/** Config with feature flag disabled */
type DisabledConfig = { isEnabled: false };

/** Feature config (when flag is used) */
export type FeatureConfig<T extends SchemaFields> =
  | EnabledConfig<T>
  | DisabledConfig;

/** Flag options */
type FlagOptions = {
  env: string;
  value: string | undefined;
};

/** Options object with flag (returns FeatureConfig) */
type ConfigOptionsWithFlag<T extends SchemaFields> = {
  flag: FlagOptions;
  constraints?: (schema: T) => Constraint<T>[];
};

/** Options object without flag (returns InferConfigResult) */
type ConfigOptionsWithoutFlag<T extends SchemaFields> = {
  flag?: undefined;
  constraints: (schema: T) => Constraint<T>[];
};

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when configuration validation fails.
 */
export class InvalidConfigurationError extends Error {
  constructor(message: string, schemaName?: string) {
    const schema = schemaName ? ` for ${schemaName}` : "";
    super(
      `Configuration validation error${schema}! Did you correctly set all required environment variables in your .env* file?\n - ${message}`,
    );
    this.name = "InvalidConfigurationError";
  }
}

/**
 * Error thrown when server-only config is accessed on the client.
 */
export class ServerConfigClientAccessError extends Error {
  constructor(schemaName: string, key: string, envName: string) {
    super(
      `[${schemaName}] Attempted to access server-only config 'server.${key}' (${envName}) on client. ` +
        `Move this value to 'public' if it needs client access, or ensure this code only runs on server.`,
    );
    this.name = "ServerConfigClientAccessError";
  }
}

// =============================================================================
// Field Builders
// =============================================================================

type ServerFieldOptionsBase = {
  env: string;
  value?: string | undefined;
  optional?: boolean;
};

type ServerFieldOptionsWithSchema<T extends z.ZodTypeAny> =
  ServerFieldOptionsBase & {
    schema: T;
  };

type ServerFieldOptionsWithoutSchema = ServerFieldOptionsBase & {
  schema?: undefined;
};

type PublicFieldOptionsBase = {
  env: string;
  value: string | undefined; // Required for public fields (Next.js inlining)
  optional?: boolean;
};

type PublicFieldOptionsWithSchema<T extends z.ZodTypeAny> =
  PublicFieldOptionsBase & {
    schema: T;
  };

type PublicFieldOptionsWithoutSchema = PublicFieldOptionsBase & {
  schema?: undefined;
};

/**
 * Define a server-only config field.
 * Server fields are only accessible on the server and throw on client access.
 *
 * @example
 * ```ts
 * server({ env: "DATABASE_URL" })
 * server({ env: "PORT", schema: z.coerce.number().default(3000) })
 * server({ env: "OPTIONAL_KEY", optional: true })
 * ```
 */
export function server<T extends z.ZodTypeAny>(
  options: ServerFieldOptionsWithSchema<T>,
): ServerFieldDef<T>;
export function server(
  options: ServerFieldOptionsWithoutSchema,
): ServerFieldDef<z.ZodString>;
export function server(
  options: ServerFieldOptionsBase & { schema?: z.ZodTypeAny },
): ServerFieldDef<z.ZodTypeAny> {
  const { env, value, schema = z.string(), optional = false } = options;

  return {
    _type: "server" as const,
    env,
    value: value ?? process.env[env],
    schema,
    isOptional: optional,
  };
}

/**
 * Define a public config field (accessible on both server and client).
 * The value must be passed directly for Next.js to inline NEXT_PUBLIC_* variables.
 *
 * @example
 * ```ts
 * pub({ env: "NEXT_PUBLIC_DSN", value: process.env.NEXT_PUBLIC_DSN })
 * pub({ env: "NEXT_PUBLIC_ENABLED", value: process.env.NEXT_PUBLIC_ENABLED, schema: z.string().optional() })
 * ```
 */
export function pub<T extends z.ZodTypeAny>(
  options: PublicFieldOptionsWithSchema<T>,
): PublicFieldDef<T>;
export function pub(
  options: PublicFieldOptionsWithoutSchema,
): PublicFieldDef<z.ZodString>;
export function pub(
  options: PublicFieldOptionsBase & { schema?: z.ZodTypeAny },
): PublicFieldDef<z.ZodTypeAny> {
  const { env, value, schema = z.string(), optional = false } = options;

  return {
    _type: "public" as const,
    env,
    value,
    schema,
    isOptional: optional,
  };
}

// =============================================================================
// Constraints
// =============================================================================

/**
 * Create a "one of" constraint.
 * At least one of the specified fields must have a value.
 *
 * @example
 * ```ts
 * configSchema("AI", {
 *   oidcToken: server({ env: "VERCEL_OIDC_TOKEN" }),
 *   apiKey: server({ env: "API_KEY" }),
 * }, {
 *   constraints: (s) => [oneOf([s.oidcToken, s.apiKey])],
 * })
 * ```
 */
export function oneOf<T extends SchemaFields>(
  fieldDefs: FieldDef[],
): Constraint<T> {
  return (allFields) => {
    // Find which field names match the provided field defs
    const fieldNames: (keyof T)[] = [];
    for (const [name, field] of Object.entries(allFields)) {
      if (fieldDefs.includes(field)) {
        fieldNames.push(name as keyof T);
      }
    }

    const satisfied = fieldDefs.some(
      (field) => field.value !== undefined && field.value !== "",
    );

    return {
      type: "oneOf",
      fields: fieldNames,
      satisfied,
    };
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checks if a flag value is truthy.
 */
function isFlagEnabled(flag: string | undefined): boolean {
  if (!flag) return false;
  return ["true", "1", "yes"].includes(flag.toLowerCase());
}

/**
 * Detects browser runtime without relying on DOM lib types.
 */
function isBrowserRuntime(): boolean {
  return typeof globalThis !== "undefined" && "window" in globalThis;
}

/**
 * Creates a Proxy that throws when server config is accessed on client.
 */
function createServerProxy<T extends object>(
  data: T,
  schemaName: string,
  fieldEnvMap: Record<string, string>,
): T {
  if (!isBrowserRuntime()) {
    return data;
  }

  return new Proxy(data, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      const key = String(prop);
      const envName = fieldEnvMap[key] ?? "UNKNOWN";
      throw new ServerConfigClientAccessError(schemaName, key, envName);
    },
  });
}

// =============================================================================
// Schema Builder
// =============================================================================

// Overload 1: No options (just name and fields)
export function configSchema<T extends SchemaFields>(
  name: string,
  fields: T,
): InferConfigResult<T>;

// Overload 2: With flag option (returns FeatureConfig)
export function configSchema<T extends SchemaFields>(
  name: string,
  fields: T,
  options: ConfigOptionsWithFlag<T>,
): FeatureConfig<T>;

// Overload 3: With constraints but no flag (returns InferConfigResult)
export function configSchema<T extends SchemaFields>(
  name: string,
  fields: T,
  options: ConfigOptionsWithoutFlag<T>,
): InferConfigResult<T>;

/**
 * Define a configuration schema with typed server and public fields.
 *
 * @example Basic server-only config
 * ```ts
 * const dbConfig = configSchema("Database", {
 *   url: server({ env: "DATABASE_URL" }),
 * });
 * // Type: { server: { url: string } }
 * dbConfig.server.url
 * ```
 *
 * @example Feature flag
 * ```ts
 * const sentryConfig = configSchema("Sentry", {
 *   token: server({ env: "SENTRY_AUTH_TOKEN" }),
 *   dsn: pub({ env: "NEXT_PUBLIC_SENTRY_DSN", value: process.env.NEXT_PUBLIC_SENTRY_DSN }),
 * }, {
 *   flag: { env: "NEXT_PUBLIC_ENABLE_SENTRY", value: process.env.NEXT_PUBLIC_ENABLE_SENTRY },
 * });
 *
 * if (sentryConfig.isEnabled) {
 *   sentryConfig.server.token;  // string
 *   sentryConfig.public.dsn;    // string
 * }
 * ```
 *
 * @example Either-or with oneOf (no flag)
 * ```ts
 * const aiConfig = configSchema("AI", {
 *   oidcToken: server({ env: "VERCEL_OIDC_TOKEN" }),
 *   apiKey: server({ env: "API_KEY" }),
 * }, {
 *   constraints: (s) => [oneOf([s.oidcToken, s.apiKey])],
 * });
 * // Type: { server: { oidcToken?: string; apiKey?: string } }
 * ```
 *
 * @example Flag + constraints
 * ```ts
 * const config = configSchema("MyFeature", {
 *   token: server({ env: "TOKEN" }),
 *   backupToken: server({ env: "BACKUP_TOKEN" }),
 * }, {
 *   flag: { env: "ENABLE_FEATURE", value: process.env.ENABLE_FEATURE },
 *   constraints: (s) => [oneOf([s.token, s.backupToken])],
 * });
 * ```
 */
export function configSchema<T extends SchemaFields>(
  name: string,
  fields: T,
  options?: ConfigOptionsWithFlag<T> | ConfigOptionsWithoutFlag<T>,
): InferConfigResult<T> | FeatureConfig<T> {
  const flagOptions = options?.flag;
  const constraintsFn = options?.constraints;
  const hasFlag = flagOptions !== undefined;

  // Check if config has public fields
  const hasPublicFields = Object.values(fields).some(
    (f) => f._type === "public",
  );

  // Enforce: if config has public fields and a flag, flag must be NEXT_PUBLIC_*
  if (hasFlag && hasPublicFields) {
    const flagEnv = flagOptions.env;
    if (!flagEnv.startsWith("NEXT_PUBLIC_")) {
      throw new InvalidConfigurationError(
        `Flag "${flagEnv}" must use a NEXT_PUBLIC_* variable when config has public fields. ` +
          `Otherwise, isEnabled will always be false on the client.`,
        name,
      );
    }
  }

  // If flag exists and is disabled, return early
  if (hasFlag && !isFlagEnabled(flagOptions.value)) {
    return { isEnabled: false };
  }

  // Evaluate constraints if provided
  const constraintList = constraintsFn ? constraintsFn(fields) : [];
  const constraintResults = constraintList.map((c) => c(fields));

  // Collect oneOf constraint results
  const oneOfResults = constraintResults.filter(
    (r): r is ConstraintResult<T> => r.type === "oneOf",
  );

  // Track which fields are covered by oneOf (making them conditionally optional)
  const oneOfFieldNames = new Set<string>();

  for (const result of oneOfResults) {
    for (const fieldName of result.fields) {
      oneOfFieldNames.add(fieldName as string);
    }
  }

  const isClient = isBrowserRuntime();

  // Process fields
  const serverFields: Record<string, unknown> = {};
  const publicFields: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(fields)) {
    // Skip server validation on client
    if (field._type === "server" && isClient) {
      continue;
    }

    const { value, schema, isOptional } = field;

    // Check if this field is covered by a oneOf constraint
    const isInOneOf = oneOfFieldNames.has(key);
    let canSkipValidation = isOptional;

    if (isInOneOf && value === undefined) {
      // Check if any oneOf constraint covering this field is satisfied
      const relevantOneOf = oneOfResults.find((r) =>
        r.fields.includes(key as keyof T),
      );
      if (relevantOneOf?.satisfied) {
        canSkipValidation = true;
      }
    }

    // Skip validation for optional fields with undefined value
    if (value === undefined && canSkipValidation) {
      if (field._type === "server") {
        serverFields[key] = undefined;
      } else {
        publicFields[key] = undefined;
      }
      continue;
    }

    // Validate
    const parseResult = schema.safeParse(value);

    if (!parseResult.success) {
      const section = field._type;
      const issue = parseResult.error.issues[0];
      let message: string;

      if (value === undefined) {
        // Check if part of oneOf
        if (isInOneOf) {
          const relevantOneOf = oneOfResults.find((r) =>
            r.fields.includes(key as keyof T),
          );
          if (relevantOneOf) {
            const otherFields = relevantOneOf.fields
              .filter((f) => f !== key)
              .map((f) => {
                const otherField = fields[f as keyof T];
                const otherEnv = otherField?.env ?? "UNKNOWN_ENV";
                return `${section}.${String(f)} (${otherEnv})`;
              });
            if (otherFields.length === 1) {
              message = `Either ${section}.${key} (${field.env}) or ${otherFields[0]} must be defined.`;
            } else {
              message = `Either ${section}.${key} (${field.env}) or one of [${otherFields.join(", ")}] must be defined.`;
            }
          } else {
            message = `${section}.${key} (${field.env}) must be defined.`;
          }
        } else {
          message = `${section}.${key} (${field.env}) must be defined.`;
        }
      } else {
        message = `${section}.${key} (${field.env}) is invalid: ${issue?.message ?? "validation failed"}`;
      }

      throw new InvalidConfigurationError(message, name);
    }

    if (field._type === "server") {
      serverFields[key] = parseResult.data;
    } else {
      publicFields[key] = parseResult.data;
    }
  }

  // Build result
  const result: Record<string, unknown> = {};

  const hasServer = Object.values(fields).some((f) => f._type === "server");
  const hasPublic = Object.values(fields).some((f) => f._type === "public");

  if (hasServer) {
    // Build env name map for server fields (used for client-side error messages)
    const serverFieldEnvMap: Record<string, string> = {};
    for (const [key, field] of Object.entries(fields)) {
      if (field._type === "server") {
        serverFieldEnvMap[key] = field.env;
      }
    }
    result.server = createServerProxy(serverFields, name, serverFieldEnvMap);
  }

  if (hasPublic) {
    result.public = publicFields;
  }

  // Return with isEnabled only if flag was provided
  if (hasFlag) {
    return { ...result, isEnabled: true } as FeatureConfig<T>;
  }

  return result as InferConfigResult<T>;
}
