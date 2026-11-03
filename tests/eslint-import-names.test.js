/**
 * The repo's own import rule (scripts/eslint-import-names.js, plan 2026-10-31): a name imported
 * from a relative path must be exported there — the check `no-undef` does not make.
 */
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import { importNames } from "../scripts/eslint-import-names.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "eslint-import-names");
const filename = path.join(dir, "user.js");
const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });

tester.run("local/import-names", importNames, {
  valid: [
    { filename, code: 'import { a, b, d, renamed } from "./lib.js";' },
    { filename, code: 'import lib from "./lib.js";' },
    { filename, code: 'import { fromStar } from "./lib.js";' }, // through `export *`
    { filename, code: 'import * as all from "./lib.js";' },
    { filename, code: 'export { a } from "./lib.js";' },
    { filename, code: 'import { anything } from "eslint";' }, // packages are not checked
  ],
  invalid: [
    {
      // the 2026-10-31 printing move: a name imported from the wrong module
      filename,
      code: 'import { a, notThere } from "./lib.js";',
      errors: [{ messageId: "missingName", data: { name: "notThere", spec: "./lib.js" } }],
    },
    { filename, code: 'import { e } from "./lib.js";', errors: [{ messageId: "missingName" }] }, // exported as `renamed`
    { filename, code: 'import more from "./more.js";', errors: [{ messageId: "missingDefault" }] },
    { filename, code: 'import { a } from "./gone.js";', errors: [{ messageId: "missingFile" }] },
    { filename, code: 'export { nope } from "./lib.js";', errors: [{ messageId: "missingName" }] },
    // a target the rule cannot read is reported, never passed unchecked
    { filename, code: 'import { x } from "./broken.js";', errors: [{ messageId: "unreadable" }] },
  ],
});
