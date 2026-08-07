import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".artifacts/**",
      ".direnv/**",
      "ai/**",
      "dist/**",
      "fixtures/**/report/assets/**",
      "fixtures/**/expected/**",
      "node_modules/**",
      "packages/cli/dist/**",
      "skills/utsuri-review/assets/**",
      "skills/utsuri-review/scripts/utsuri.mjs"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off"
    }
  }
);
