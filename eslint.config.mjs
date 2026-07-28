import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Generated artefacts, not source. JMeter's HTML dashboards vendor
    // jQuery, Bootstrap and Flot, and linting those buried 416 errors and
    // 4,796 warnings of third-party noise in the output — enough to make
    // `npm run lint` useless for finding anything in our own code.
    "assignment3/jmeter/results/**",
    "assignment3/zap/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
