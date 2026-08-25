import js from "../node_modules/.pnpm/@eslint+js@9.39.5/node_modules/@eslint/js/src/index.js";
import globals from "../node_modules/.pnpm/globals@14.0.0/node_modules/globals/index.js";
import tsParser from "../node_modules/.pnpm/@typescript-eslint+parser@8.68.0_eslint@9.39.5_jiti@2.7.0__typescript@5.9.3/node_modules/@typescript-eslint/parser/dist/index.js";

export default [
  { ignores: [".next/**", "node_modules/**", "tsconfig.tsbuildinfo"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { "no-console": "off", "no-unused-vars": "off", "no-undef": "off" },
  },
];
