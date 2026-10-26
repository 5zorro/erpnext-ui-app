import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// @covers scripts/check-commit-attribution.sh
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

  it("rejects model/tool codenames case-insensitively", () => {
    for (const word of ["Claude", "Gemini", "GPT", "Llama", "Cursor"]) {
      const result = scanMessage(`fix: something involving ${word}\n`);
      assert.equal(result.status, 1, word);
      assert.match(result.stderr, /model\/tool codename/i, word);
    }
  });

  it("does not false-positive on ordinary words containing those substrings", () => {
    assert.equal(scanMessage("fix: opusculent typo in the changelog\n").status, 0);
    assert.equal(scanMessage("fix: composite of opuses in the report\n").status, 0);
    assert.equal(scanMessage("fix: precursor state was stale on reload\n").status, 0);
    assert.equal(scanMessage("fix: a cursory look at the totals\n").status, 0);
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

describe("AI-session sizing policy", () => {
  const identity = {
    GIT_AUTHOR_NAME: "5zorro",
    GIT_AUTHOR_EMAIL: "25825485+5zorro@users.noreply.github.com",
    GIT_COMMITTER_NAME: "5zorro",
    GIT_COMMITTER_EMAIL: "25825485+5zorro@users.noreply.github.com",
  };
  // Each pattern in SIZING_RE at least once; zero and zz mark them as synthetic.
  const models = ["claude", "gemini", "gpt", "llama"];
  const probes = [
    "zz 0% context zz",
    "zz context 0% zz",
    "zz 0k tokens zz",
    "zz 1m window zz",
    ...models.map((m) => `zz ${m} 0 zz`),
  ];
  function scanStaged(content) {
    const dir = mkdtempSync(join(tmpdir(), "commit-policy-staged-"));
    git(dir, ["init", "-q"]);
    writeFileSync(join(dir, "plan.md"), content);
    git(dir, ["add", "plan.md"]);
    writeFileSync(join(dir, "msg.txt"), "docs: plan\n");
    return spawnSync("bash", [scanner, "--message-file", join(dir, "msg.txt")], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...identity },
    });
  }

  it("rejects a message that sizes the session", () => {
    for (const probe of probes) {
      const result = scanMessage(`docs: ${probe}\n`);
      assert.equal(result.status, 1, probe);
      assert.match(result.stderr, /sizes an AI session/, probe);
    }
  });

  it("rejects a staged line that sizes the session", () => {
    for (const probe of probes) {
      const result = scanStaged(`${probe}\n`);
      assert.equal(result.status, 1, probe);
      assert.match(result.stderr, /staged change adds a line that sizes an AI session/, probe);
    }
  });

  it("the policy's own files carry no real sizing: every number they match is 0 or the 1m pattern", () => {
    // The scanner skips these two files (POLICY_FILES), so this test is what checks them.
    const script = readFileSync(scanner, "utf8");
    const sizingRe = /^SIZING_RE='(.*)'$/m.exec(script)[1];
    for (const file of [scanner, fileURLToPath(import.meta.url)]) {
      const text = readFileSync(file, "utf8").toLowerCase();
      const hits = spawnSync("grep", ["-noE", sizingRe], { input: text, encoding: "utf8" }).stdout;
      for (const hit of hits.split("\n").filter(Boolean)) {
        const match = hit.slice(hit.indexOf(":") + 1);
        assert.doesNotMatch(match.replace(/1m/g, ""), /[1-9]/, `${file}: ${hit}`);
      }
    }
  });

  it("lets ordinary percentages, windows and CSS through", () => {
    for (const line of [
      "the drawer stood 631px tall (58% of the window)\n",
      "under chaos (250 ms, 45 %)\n",
      "button { cursor: pointer; }\n",
      "a 100% portion; contextIsolation: true\n",
    ]) {
      const result = scanStaged(line);
      assert.equal(result.status, 0, `${line}${result.stderr}`);
    }
  });
});

describe("cited commits", () => {
  const identity = {
    GIT_AUTHOR_NAME: "5zorro",
    GIT_AUTHOR_EMAIL: "25825485+5zorro@users.noreply.github.com",
    GIT_COMMITTER_NAME: "5zorro",
    GIT_COMMITTER_EMAIL: "25825485+5zorro@users.noreply.github.com",
  };
  // A repository with one commit to cite; `missing` is a hash it does not have.
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "commit-policy-cite-"));
    git(dir, ["init", "-q"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "first"], identity);
    const sha = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
    const missing = sha.startsWith("0") ? "1a2b3c4d" : "0a1b2c3d";
    return { dir, sha, short: sha.slice(0, 7), missing };
  }
  function scan(dir, message, staged = {}) {
    for (const [name, content] of Object.entries(staged)) {
      writeFileSync(join(dir, name), content);
      git(dir, ["add", name]);
    }
    writeFileSync(join(dir, "msg.txt"), message);
    return spawnSync("bash", [scanner, "--message-file", join(dir, "msg.txt")], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...identity },
    });
  }

  it("accepts a message citing a commit the repository has, short or full", () => {
    const r = repo();
    assert.equal(scan(r.dir, `fix: the gap left by ${r.short} (see ${r.sha})\n`).status, 0);
  });

  it("rejects a message citing a commit the repository does not have", () => {
    const r = repo();
    const result = scan(r.dir, `fix: the gap left by ${r.missing}\n`);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`cites commit ${r.missing}, which is not in this repository`));
  });

  it("skips another repository's commit, words without a digit or a letter, and git's own comment lines", () => {
    const r = repo();
    const message = [
      `fix: as upstream did in frappe/frappe@${r.missing}`,
      "the deadbeef case; 12345678 rows",
      "# Please enter the commit message for your changes.",
      "# ------------------------ >8 ------------------------",
      `index ${r.missing}..1f2e3d4c 100644`,
      "",
    ].join("\n");
    const result = scan(r.dir, message);
    assert.equal(result.status, 0, result.stderr);
  });

  it("checks a staged Markdown line whole, and only code spans elsewhere", () => {
    let r = repo();
    let result = scan(r.dir, "docs: plan\n", { "plan.md": `Fixed in ${r.missing}.\n` });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /the staged change cites commit/);

    r = repo();
    result = scan(r.dir, "docs: plan\n", { "plan.md": `Fixed in ${r.short}.\n` });
    assert.equal(result.status, 0, result.stderr);

    r = repo();
    result = scan(r.dir, "test: bytes\n", { "a.test.js": `assert.match(listing, /notes 68656c6c6f2062/); // ${r.missing}\n` });
    assert.equal(result.status, 0, result.stderr);

    r = repo();
    result = scan(r.dir, "fix: probe\n", { "a.probe.js": `// It failed before \`${r.missing}\`.\n` });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /the staged change cites commit/);
  });

  it("checks each commit's message and added lines across a range", () => {
    const r = repo();
    git(r.dir, ["commit", "--allow-empty", "-q", "-m", `fix: after ${r.missing}`], identity);
    const head = git(r.dir, ["rev-parse", "HEAD"]).stdout.trim();
    const result = spawnSync("bash", [scanner, "--range", `${r.sha}..${head}`], { cwd: r.dir, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cites commit/);
  });
});
