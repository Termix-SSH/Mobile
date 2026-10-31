const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const unusedImports = require("eslint-plugin-unused-imports");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", ".expo/*", "store/*"],
  },
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // React Compiler rules from eslint-config-expo 57. The compiler skips components that
    // break them, so they warn until those components are cleaned up.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    // The rest of the plugin SDK needs Node; only the host scripts run in the app.
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@termix-ssh/plugin-sdk(?!/host-scripts$)",
              message:
                "Only @termix-ssh/plugin-sdk/host-scripts runs in the app.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "scripts/**/*.{js,cjs,mjs}",
      "plugins/**/*.js",
      "tests/**/*.{cjs,mjs}",
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
