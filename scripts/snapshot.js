#!/usr/bin/env node
/**
 * `npm run snapshot -- <dir>` — a frozen copy of the working tree to run a long check from
 * (`dogfood:check`, `nav:check`) while the main folder is edited: a probe launches the app from its
 * folder's live files, so edits during a check from the main folder change what later probes test.
 * `npm run snapshot -- --remove <dir>` takes it away again.
 *
 * The copy is a `git worktree` at a commit made from everything not ignored, new files included,
 * through a temporary index (`git stash create` leaves new files out, and the real index and the
 * stash list are not touched). Its `node_modules` and `test-logs` are links to the main folder's:
 * nothing is installed, and the run's evidence (`runs.tsv`, `failures/`, the check tables) lands
 * where `npm run test:flaky` reads it and outlives the copy. The probe locks are the main folder's
 * anyway (tests/probes/probe-user-retire.js), so a probe here and one there queue. A run there is
 * logged against the snapshot's commit, whose parent is the main folder's HEAD at the time.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args, env = {}) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } }).trim();

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const dirArg = args.find((a) => !a.startsWith("--"));
if (!dirArg) {
  console.error("usage: npm run snapshot -- <dir>   |   npm run snapshot -- --remove <dir>");
  process.exit(2);
}
const dir = path.resolve(dirArg);
const LINKS = ["node_modules", "test-logs"];

if (remove) {
  for (const name of LINKS) {
    const p = path.join(dir, name);
    if (fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(p);
  }
  git(["worktree", "remove", "--force", dir]);
  git(["worktree", "prune"]);
  console.log(`removed ${dir}`);
  process.exit(0);
}

if (fs.existsSync(dir)) {
  console.error(`${dir} exists already — pick a new folder, or remove it first (--remove).`);
  process.exit(2);
}
const tmpIndex = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-")), "index");
let commit;
try {
  fs.copyFileSync(path.resolve(ROOT, git(["rev-parse", "--git-path", "index"])), tmpIndex);
  git(["add", "-A"], { GIT_INDEX_FILE: tmpIndex });
  const tree = git(["write-tree"], { GIT_INDEX_FILE: tmpIndex });
  commit = git(["commit-tree", tree, "-p", "HEAD", "-m", `snapshot of the working tree for a check (${new Date().toISOString()})`]);
} finally {
  fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true });
}
git(["worktree", "add", "--detach", dir, commit]);
// The links are untracked in the copy (.gitignore's `node_modules/` matches a folder, not a link to
// one), which would mark every run there "dirty" in runs.tsv. The repo-local exclude list is shared
// by every checkout; in the main folder these names are ignored already.
const exclude = path.resolve(ROOT, git(["rev-parse", "--git-path", "info/exclude"]));
const listed = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8").split("\n") : [];
const add = LINKS.map((n) => `/${n}`).filter((l) => !listed.includes(l));
if (add.length) fs.appendFileSync(exclude, `${listed.length && listed[listed.length - 1] !== "" ? "\n" : ""}# links in a snapshot copy (scripts/snapshot.js)\n${add.join("\n")}\n`);
for (const name of LINKS) {
  const inCopy = path.join(dir, name);
  fs.rmSync(inCopy, { recursive: true, force: true }); // test-logs/ is untracked, but be sure
  fs.symlinkSync(path.join(ROOT, name), inCopy);
}
console.log(`snapshot ${commit.slice(0, 7)} at ${dir}\n  run the check there, e.g.: (cd ${dir} && npm run dogfood:check)\n  then: npm run snapshot -- --remove ${dir}`);
