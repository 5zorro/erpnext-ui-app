/**
 * The repo's lint check (plan 2026-10-31, Steps 3–4). ESLint's recommended rules, the same base
 * ERPNext and Frappe use, plus `local/import-names` (scripts/eslint-import-names.js): a name
 * imported from a relative path must be exported there. Run: `npm run lint`.
 *
 * Scope for now is the app's own code, `electron/` and `src/` (Step 4: the tests and scripts next).
 */
import js from "@eslint/js";
import globals from "globals";
import localRules from "./scripts/eslint-import-names.js";

export default [
  {
    ignores: ["**/node_modules/**", "tests/fixtures/**", "test-results/**", "test-logs/**", "dist/**", "out/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: { local: localRules },
    rules: {
      "local/import-names": "error",
      // An empty `catch {}` is this codebase's "ignore it on purpose" (51 of them); other empty blocks still report.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The three control-character ranges in regular expressions strip those characters on purpose.
      "no-control-regex": "off",
      // The byte-order mark in sheet-preview.js's regular expression strips it on purpose.
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      // An unused `catch (e)` name is the older spelling of `catch {}`; `_name` marks an argument kept for its place.
      "no-unused-vars": ["error", { caughtErrors: "none", argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Off: all 17 cases on 2026-11-02 were a safe starting value set before a try or an if chain
      // (`let response = 2` before a dialog), none a bug; rewriting them would change nothing.
      "no-useless-assignment": "off",
      // On, so the three deliberate `new Function` uses in doc-actions.js keep their reasons in their
      // eslint-disable comments and a new one has to give its own.
      "no-new-func": "error",
    },
  },
  {
    // Electron's main process: Node.
    files: ["electron/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Preloads: CommonJS, run with Node and a page.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Scripts injected into ERPNext's own pages, where Frappe's page-wide names exist.
    files: ["electron/erp-form-bridge-page.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, frappe: "readonly", cur_frm: "readonly", $: "readonly", jQuery: "readonly", __: "readonly" },
    },
  },
  {
    // Pages: the browser.
    files: ["src/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // src/ modules the main process or the test tooling also runs: Node's `process` / `Buffer`.
    files: ["src/config.js", "src/erp-chaos-lag.js", "src/feedback-url.js", "src/sample-data/sandbox-guard.js", "src/test-run-log.js"],
    languageOptions: { globals: { process: "readonly", Buffer: "readonly" } },
  },
];
