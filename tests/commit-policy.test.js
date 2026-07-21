import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanner = join(repoRoot, "scripts", "check-commit-attribution.sh");

function scanMessage(message) {
  const dir = mkdtempSync(join(tmpdir(), "commit-policy-"));
  const messageFile = join(dir, "message.txt");
  writeFileSync(messageFile, message);
  return spawnSync("bash", [scanner, "--message-file", messageFile], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function git(cwd, args, env = {}) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("commit attribution policy", () => {
  it("accepts an ordinary commit message", () => {
    assert.equal(scanMessage("fix: preserve draft state\n").status, 0);
  });

  it("rejects co-author attribution case-insensitively", () => {
    const result = scanMessage("Fix issue\n\nCo-Authored-By: Example <bot@example.test>\n");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /co-author attribution/i);
  });

  it("rejects Gmail addresses or markers", () => {
    const result = scanMessage("Contact Example.Person@GMAIL\n");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Gmail address or marker/i);
  });

  it("checks author and committer metadata across a range", () => {
    const dir = mkdtempSync(join(tmpdir(), "commit-policy-git-"));
    assert.equal(git(dir, ["init", "-q"]).status, 0);
    assert.equal(
      git(dir, ["commit", "--allow-empty", "-q", "-m", "clean"], {
        GIT_AUTHOR_NAME: "5zorro",
        GIT_AUTHOR_EMAIL: "25825485+5zorro@users.noreply.github.com",
        GIT_COMMITTER_NAME: "5zorro",
        GIT_COMMITTER_EMAIL: "25825485+5zorro@users.noreply.github.com",
      }).status,
      0,
    );
    const base = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
    assert.equal(
      git(dir, ["commit", "--allow-empty", "-q", "-m", "bad identity"], {
        GIT_AUTHOR_NAME: "Example",
        GIT_AUTHOR_EMAIL: "example@gmail.com",
        GIT_COMMITTER_NAME: "5zorro",
        GIT_COMMITTER_EMAIL: "25825485+5zorro@users.noreply.github.com",
      }).status,
      0,
    );
    const head = git(dir, ["rev-parse", "HEAD"]).stdout.trim();

    const result = spawnSync("bash", [scanner, "--range", `${base}..${head}`], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Gmail address or marker/i);
  });
});
