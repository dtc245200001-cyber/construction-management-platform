import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "playwright-report", "test-results"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-unused-vars": "off"
    },
  },
  {
    // E2E (Playwright) và file cấu hình chạy trên Node nên cần global của Node
    // (Buffer, process). Phần page.evaluate trong spec vẫn dùng global trình duyệt.
    files: ["e2e/**/*.js", "playwright.config.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];