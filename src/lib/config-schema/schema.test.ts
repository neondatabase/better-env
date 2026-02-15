import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import {
  configSchema,
  server,
  pub,
  oneOf,
  InvalidConfigurationError,
  ServerConfigClientAccessError,
} from "./schema.ts";

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
  // @ts-expect-error - intentionally manipulating global for tests
  delete globalThis.window;
});

describe("configSchema", () => {
  describe("server section", () => {
    it("loads string values", () => {
      const config = configSchema("Test", {
        url: server({ env: "URL", value: "postgres://localhost:5432/test" }),
      });

      expect(config.server.url).toBe("postgres://localhost:5432/test");
    });

    it("throws when required value is undefined", () => {
      expect(() =>
        configSchema("Test", {
          url: server({ env: "URL", value: undefined }),
        }),
      ).toThrow(InvalidConfigurationError);
    });

    it("includes key path in error message", () => {
      try {
        configSchema("Test", {
          secretKey: server({ env: "SECRET_KEY", value: undefined }),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err).toBeInstanceOf(InvalidConfigurationError);
        expect(err.message).toContain(
          "server.secretKey (SECRET_KEY) must be defined",
        );
      }
    });

    it("includes schema name in error message when provided", () => {
      try {
        configSchema("Stripe", {
          apiKey: server({ env: "API_KEY", value: undefined }),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err.message).toContain("for Stripe");
      }
    });
  });

  describe("public section", () => {
    it("loads string values", () => {
      const config = configSchema("Test", {
        dsn: pub({
          env: "NEXT_PUBLIC_DSN",
          value: "https://sentry.io/123",
        }),
      });

      expect(config.public.dsn).toBe("https://sentry.io/123");
    });

    it("throws when required value is undefined", () => {
      expect(() =>
        configSchema("Test", {
          dsn: pub({ env: "NEXT_PUBLIC_DSN", value: undefined }),
        }),
      ).toThrow(InvalidConfigurationError);
    });

    it("includes key path in error message", () => {
      try {
        configSchema("Test", {
          analyticsId: pub({
            env: "NEXT_PUBLIC_ANALYTICS_ID",
            value: undefined,
          }),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err).toBeInstanceOf(InvalidConfigurationError);
        expect(err.message).toContain(
          "public.analyticsId (NEXT_PUBLIC_ANALYTICS_ID) must be defined",
        );
      }
    });
  });

  describe("mixed server and public", () => {
    it("loads both sections", () => {
      const config = configSchema("Test", {
        token: server({ env: "TOKEN", value: "secret-token" }),
        dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://example.com" }),
      });

      expect(config.server.token).toBe("secret-token");
      expect(config.public.dsn).toBe("https://example.com");
    });
  });

  describe("custom schemas", () => {
    it("coerces string to number", () => {
      const config = configSchema("Test", {
        port: server({ env: "PORT", value: "3000", schema: z.coerce.number() }),
      });

      expect(config.server.port).toBe(3000);
      expect(typeof config.server.port).toBe("number");
    });

    it("uses default value when undefined", () => {
      const config = configSchema("Test", {
        poolSize: server({
          env: "POOL_SIZE",
          value: undefined,
          schema: z.coerce.number().default(10),
        }),
      });

      expect(config.server.poolSize).toBe(10);
    });

    it("allows optional values with schema", () => {
      const config = configSchema("Test", {
        optional: server({
          env: "OPTIONAL",
          value: undefined,
          schema: z.string().optional(),
        }),
      });

      expect(config.server.optional).toBeUndefined();
    });

    it("validates with custom schema and shows error", () => {
      try {
        configSchema("Test", {
          email: pub({
            env: "NEXT_PUBLIC_EMAIL",
            value: "invalid-email",
            schema: z.string().email("Must be a valid email"),
          }),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err).toBeInstanceOf(InvalidConfigurationError);
        expect(err.message).toContain(
          "public.email (NEXT_PUBLIC_EMAIL) is invalid",
        );
      }
    });
  });

  describe("feature flags", () => {
    it("returns isEnabled: false when flag value is undefined", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: "key" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: undefined },
        },
      );

      expect(config.isEnabled).toBe(false);
    });

    it("returns isEnabled: false when flag value is empty string", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: "key" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: "" },
        },
      );

      expect(config.isEnabled).toBe(false);
    });

    it("returns isEnabled: false when flag value is 'false'", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: "key" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: "false" },
        },
      );

      expect(config.isEnabled).toBe(false);
    });

    it("validates and returns config when flag value is 'true'", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: "secret-key" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: "true" },
        },
      );

      expect(config.isEnabled).toBe(true);
      if (config.isEnabled) {
        expect(config.server.apiKey).toBe("secret-key");
      }
    });

    it("accepts '1' and 'yes' as truthy flag values", () => {
      for (const value of ["1", "yes", "YES", "True", "TRUE"]) {
        const config = configSchema(
          "Test",
          {
            apiKey: server({ env: "API_KEY", value: "test" }),
          },
          {
            flag: { env: "ENABLE_FEATURE", value },
          },
        );

        expect(config.isEnabled).toBe(true);
      }
    });

    it("throws when flag is enabled but value is undefined", () => {
      expect(() =>
        configSchema(
          "Test",
          {
            apiKey: server({ env: "API_KEY", value: undefined }),
          },
          {
            flag: { env: "ENABLE_FEATURE", value: "true" },
          },
        ),
      ).toThrow(InvalidConfigurationError);
    });

    it("skips validation when flag is disabled", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: undefined }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: undefined },
        },
      );

      expect(config.isEnabled).toBe(false);
    });

    it("works with flag + constraints", () => {
      const config = configSchema(
        "Test",
        {
          oidcToken: server({ env: "OIDC_TOKEN", value: undefined }),
          apiKey: server({ env: "API_KEY", value: "api-key" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: "true" },
          constraints: (s) => [oneOf([s.oidcToken, s.apiKey])],
        },
      );

      expect(config.isEnabled).toBe(true);
      if (config.isEnabled) {
        expect(config.server.oidcToken).toBeUndefined();
        expect(config.server.apiKey).toBe("api-key");
      }
    });

    it("throws when flag is not NEXT_PUBLIC_* but config has public fields", () => {
      expect(() =>
        configSchema(
          "Test",
          {
            token: server({ env: "TOKEN", value: "secret" }),
            dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://example.com" }),
          },
          {
            flag: { env: "ENABLE_FEATURE", value: "true" },
          },
        ),
      ).toThrow(InvalidConfigurationError);
    });

    it("includes helpful message when flag is not NEXT_PUBLIC_* with public fields", () => {
      try {
        configSchema(
          "Sentry",
          {
            dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://example.com" }),
          },
          {
            flag: { env: "ENABLE_SENTRY", value: "true" },
          },
        );
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err).toBeInstanceOf(InvalidConfigurationError);
        expect(err.message).toContain("ENABLE_SENTRY");
        expect(err.message).toContain("NEXT_PUBLIC_*");
        expect(err.message).toContain("isEnabled will always be false");
      }
    });

    it("allows non-NEXT_PUBLIC_* flag when config has only server fields", () => {
      const config = configSchema(
        "Test",
        {
          apiKey: server({ env: "API_KEY", value: "secret" }),
        },
        {
          flag: { env: "ENABLE_FEATURE", value: "true" },
        },
      );

      expect(config.isEnabled).toBe(true);
    });

    it("allows NEXT_PUBLIC_* flag when config has public fields", () => {
      const config = configSchema(
        "Test",
        {
          dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://example.com" }),
        },
        {
          flag: { env: "NEXT_PUBLIC_ENABLE_FEATURE", value: "true" },
        },
      );

      expect(config.isEnabled).toBe(true);
    });
  });

  describe("client-side proxy protection", () => {
    it("allows access to public vars on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema("Test", {
        dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://sentry.io/123" }),
      });

      expect(config.public.dsn).toBe("https://sentry.io/123");
    });

    it("throws when accessing server var on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema("Test", {
        token: server({ env: "TOKEN", value: "super-secret" }),
      });

      expect(() => config.server.token).toThrow(ServerConfigClientAccessError);
    });

    it("includes schema name, key, and env name in client access error", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema("Auth", {
        authToken: server({ env: "AUTH_TOKEN", value: "secret" }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        config.server.authToken;
        expect.unreachable("Should have thrown");
      } catch (e) {
        const err = coerceError(e);
        expect(err).toBeInstanceOf(ServerConfigClientAccessError);
        expect(err.message).toContain("[Auth]");
        expect(err.message).toContain("server.authToken");
        expect(err.message).toContain("AUTH_TOKEN");
      }
    });

    it("allows isEnabled access on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema(
        "Test",
        {
          key: pub({ env: "NEXT_PUBLIC_KEY", value: "public-value" }),
        },
        {
          flag: { env: "NEXT_PUBLIC_ENABLE_FEATURE", value: "true" },
        },
      );

      expect(config.isEnabled).toBe(true);
    });

    it("does not use proxy on server (no window)", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      delete globalThis.window;

      const config = configSchema("Test", {
        token: server({ env: "TOKEN", value: "super-secret" }),
      });

      expect(config.server.token).toBe("super-secret");
    });
  });

  describe("client-side validation behavior", () => {
    it("skips server validation on client (undefined server vars don't throw)", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema("Test", {
        apiKey: server({ env: "API_KEY", value: undefined }),
        secretToken: server({ env: "SECRET_TOKEN", value: undefined }),
        dsn: pub({ env: "NEXT_PUBLIC_DSN", value: "https://sentry.io" }),
      });

      expect(config.public.dsn).toBe("https://sentry.io");
      expect(() => config.server.apiKey).toThrow(ServerConfigClientAccessError);
    });

    it("still validates public section on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      expect(() =>
        configSchema("Test", {
          apiKey: server({ env: "API_KEY", value: undefined }),
          dsn: pub({ env: "NEXT_PUBLIC_DSN", value: undefined }),
        }),
      ).toThrow(InvalidConfigurationError);
    });

    it("skips server schema validation on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      const config = configSchema("Test", {
        port: server({
          env: "PORT",
          value: "not-a-number",
          schema: z.coerce.number(),
        }),
        key: pub({ env: "NEXT_PUBLIC_KEY", value: "value" }),
      });

      expect(config.public.key).toBe("value");
      expect(() => config.server.port).toThrow(ServerConfigClientAccessError);
    });

    it("still validates public schema on client", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      globalThis.window = {};

      expect(() =>
        configSchema("Test", {
          apiKey: server({ env: "API_KEY", value: undefined }),
          email: pub({
            env: "NEXT_PUBLIC_EMAIL",
            value: "invalid-email",
            schema: z.string().email(),
          }),
        }),
      ).toThrow(InvalidConfigurationError);
    });

    it("validates on server (control test)", () => {
      // @ts-expect-error - intentionally manipulating global for tests
      delete globalThis.window;

      expect(() =>
        configSchema("Test", {
          apiKey: server({ env: "API_KEY", value: undefined }),
        }),
      ).toThrow(InvalidConfigurationError);
    });
  });
});

function coerceError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Unknown error");
}
