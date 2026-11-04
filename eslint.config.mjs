import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
      files: ["scripts/**/*.{js,mjs}"],
      rules: {
        "@next/next/no-assign-module-variable": "off",
        "react-hooks/rules-of-hooks": "off",
      },
    },
    {
      // Locale helper scripts are plain CommonJS/ESM interop tooling that
      // legitimately use `require()` and assign to `module` for dual exports.
      files: ["locales/scripts/**/*.cjs"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },
    {
      files: ["locales/scripts/**/*.mjs", "locales/scripts/**/*.js"],
      rules: {
        "@next/next/no-assign-module-variable": "off",
      },
    },
    globalIgnores([
    ".next*/**",
    "out/**",
    "public/locales/**",
    // Generated bundles include third-party code; handwritten draft modules stay linted.
    "public/drafts/discovery-activity.js",
    "public/drafts/discovery-stats-pro.js",
    "public/drafts/discovery-community-export.js",
    "next-env.d.ts",
  ]),
]);
