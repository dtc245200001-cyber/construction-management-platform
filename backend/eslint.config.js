const js = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.js"],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",

      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",

        // Jest globals
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },

    rules: {
      "no-unused-vars": "warn",
    },
  },
];