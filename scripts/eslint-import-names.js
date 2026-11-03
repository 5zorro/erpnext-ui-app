/**
 * ESLint rule `local/import-names`: every name imported from a relative path is one that file
 * exports (plan 2026-10-31, Step 3: an import rule of our own instead of a plugin).
 *
 * Why: this app loads its modules unbundled, so `import { a } from "./x.js"` with no `a` in x.js
 * passes `no-undef` and only fails when the app starts (2026-10-31: printing's move named an import
 * from the wrong module and the app would not open). A bundler would refuse it; nothing here did.
 *
 * How: the target file is read and parsed with espree, ESLint's own parser (installed with
 * ESLint as its dependency), so no package is added. Rules are not handed the parser in a form
 * that can parse another file: ESLint's RuleTester wraps it, and the wrapper fails on any text but
 * the file under test. Checked: named imports, default imports, and re-exports
 * (`export { a } from`). Not checked: bare package names, `.cjs` / `.json` targets, namespace
 * imports, `import()` calls. A target that does `export * from "./y.js"` is followed. A target that
 * cannot be read or parsed is reported, so the rule never passes a file it did not check.
 */
import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

/** @type {Map<string, { mtimeMs: number, names: Set<string>, starFrom: string[] } | null>} */
const cache = new Map();

/** Names a parsed module exports directly, plus the paths it `export *`s from. */
function exportsOf(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
  let ast;
  try {
    const text = fs.readFileSync(file, "utf8");
    ast = espree.parse(text, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    cache.set(file, null);
    return null;
  }
  const names = new Set();
  const starFrom = [];
  const addPattern = (p) => {
    if (!p) return;
    if (p.type === "Identifier") names.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach((q) => addPattern(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach((q) => addPattern(q && q.type === "RestElement" ? q.argument : q));
    else if (p.type === "AssignmentPattern") addPattern(p.left);
  };
  const nameOf = (n) => (n.type === "Literal" ? String(n.value) : n.name);
  for (const node of ast.body) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    else if (node.type === "ExportNamedDeclaration") {
      const d = node.declaration;
      if (d && d.id) names.add(d.id.name);
      if (d && d.type === "VariableDeclaration") d.declarations.forEach((v) => addPattern(v.id));
      for (const s of node.specifiers || []) names.add(nameOf(s.exported));
    } else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.add(nameOf(node.exported));
      else starFrom.push(path.resolve(path.dirname(file), String(node.source.value)));
    }
  }
  const entry = { mtimeMs: stat.mtimeMs, names, starFrom };
  cache.set(file, entry);
  return entry;
}

/** true / false when known; null when some `export *` link could not be read. */
function provides(file, name, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  const e = exportsOf(file);
  if (!e) return null;
  if (e.names.has(name)) return true;
  let unknown = false;
  for (const next of e.starFrom) {
    if (name === "default") break; // `export *` never re-exports a default
    const r = provides(next, name, seen);
    if (r === true) return true;
    if (r === null) unknown = true;
  }
  return unknown ? null : false;
}

const isChecked = (spec) =>
  typeof spec === "string" && (spec.startsWith("./") || spec.startsWith("../")) && /\.m?js$/.test(spec);

/** @type {import("eslint").Rule.RuleModule} */
export const importNames = {
  meta: {
    type: "problem",
    docs: { description: "A name imported from a relative path is exported by that file" },
    schema: [],
    messages: {
      missingFile: "'{{spec}}' does not exist.",
      missingName: "'{{name}}' is not exported by '{{spec}}'.",
      missingDefault: "'{{spec}}' has no default export.",
      unreadable: "'{{spec}}' could not be parsed, so its exports were not checked.",
    },
  },
  create(context) {
    const filename = context.filename || (context.getFilename && context.getFilename());
    const check = (node) => {
      const spec = node.source && node.source.value;
      if (!isChecked(spec) || !filename || filename === "<input>" || filename === "<text>") return;
      const target = path.resolve(path.dirname(filename), spec);
      if (!fs.existsSync(target)) {
        context.report({ node: node.source, messageId: "missingFile", data: { spec } });
        return;
      }
      if (!exportsOf(target)) {
        context.report({ node: node.source, messageId: "unreadable", data: { spec } });
        return;
      }
      for (const s of node.specifiers || []) {
        let name;
        if (s.type === "ImportSpecifier") name = s.imported.type === "Literal" ? String(s.imported.value) : s.imported.name;
        else if (s.type === "ImportDefaultSpecifier") name = "default";
        else if (s.type === "ExportSpecifier") name = s.local.type === "Literal" ? String(s.local.value) : s.local.name;
        else continue; // namespace import / export * as
        if (provides(target, name) === false) {
          context.report({
            node: s,
            messageId: name === "default" ? "missingDefault" : "missingName",
            data: { name, spec },
          });
        }
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: (node) => node.source && check(node),
    };
  },
};

export default { rules: { "import-names": importNames } };
