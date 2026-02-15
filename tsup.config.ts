export default {
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    "adapters/vercel": "src/lib/adapters/vercel.ts",
    "adapters/netlify": "src/lib/adapters/netlify.ts",
    "adapters/cloudflare": "src/lib/adapters/cloudflare.ts",
    "adapters/railway": "src/lib/adapters/railway.ts",
    "config-schema/index": "src/lib/config-schema/index.ts",
    "validate-env/index": "src/lib/validate-env/index.ts",
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
};
