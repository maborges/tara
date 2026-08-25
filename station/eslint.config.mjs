import js from "../../node_modules/.pnpm/@eslint+js@9.39.4/node_modules/@eslint/js/src/index.js";
import globals from "../../node_modules/.pnpm/globals@16.4.0/node_modules/globals/index.js";
import tsParser from "../../node_modules/.pnpm/@typescript-eslint+parser@8.57.0_eslint@9.39.4_jiti@2.6.1__typescript@5.9.3/node_modules/@typescript-eslint/parser/dist/index.js";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ServiceWorkerGlobalScope: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];

export default config;
