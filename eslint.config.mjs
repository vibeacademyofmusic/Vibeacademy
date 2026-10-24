import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Node test/bootstrap entry points intentionally use CommonJS.
    files: [
      "scripts/**/*.cjs",
      "scripts/**/*.js",
      "tests/**/*.cjs",
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // This approved VM fixture intentionally constructs a CommonJS module object.
    // Keep its design-locked source byte-for-byte while limiting this false positive.
    files: ["tests/academic-progress-actions.test.cjs"],
    rules: { "@next/next/no-assign-module-variable": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
