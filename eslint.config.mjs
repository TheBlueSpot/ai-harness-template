import tsParser from "@typescript-eslint/parser";
import tailwindCanonicalClasses from "eslint-plugin-tailwind-canonical-classes";

export default [
  {
    files: ["harness/ui/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "tailwind-canonical-classes": tailwindCanonicalClasses
    },
    rules: {
      "tailwind-canonical-classes/tailwind-canonical-classes": [
        "error",
        {
          cssPath: "./harness/ui/src/styles.css",
          calleeFunctions: ["cn", "clsx", "twMerge", "cva"]
        }
      ]
    }
  }
];
