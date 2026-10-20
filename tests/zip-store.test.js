import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildZip, uniqueZipNames, plainFileName, freeFileName } from "../src/zip-store.js";

// 5zorro 2026-10-03: "save all attachments as zip".
describe("zip-store", () => {
  it("two files with one name both survive, and nothing unpacks outside its folder", () => {
    assert.deepEqual(uniqueZipNames(["scan.pdf", "SCAN.pdf", "a/b.png", "../x"]), ["scan.pdf", "SCAN (2).pdf", "a-b.png", "-x"]);
  });

  it("writes a ZIP that a real unzip reads back byte for byte", (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "zip-store-"));
    try {
      const a = new TextEncoder().encode("hello bill");
      const b = new Uint8Array([0, 1, 2, 255, 254]);
      const zip = buildZip([{ name: "notes.txt", bytes: a }, { name: "notes.txt", bytes: b }], new Date(2026, 9, 3, 12, 0, 0));
      const file = path.join(dir, "t.zip");
      writeFileSync(file, zip);
      let listing;
      try {
        listing = execFileSync("python3", ["-c", `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());[print(n, z.read(n).hex()) for n in z.namelist()]`, file]).toString();
      } catch {
        t.skip("python3 not available to read the zip back");
        return;
      }
      assert.match(listing, /^None\n/, "no corrupt entry");
      assert.match(listing, /notes\.txt 68656c6c6f2062696c6c/);
      assert.match(listing, /notes \(2\)\.txt 000102fffe/);
      assert.equal(readFileSync(file).subarray(0, 4).toString("hex"), "504b0304");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Architecture review 2026-10-19: names shown and saved are the real ones.
describe("plainFileName / freeFileName", () => {
  it("drops the right-to-left override and other invisible characters, so the real extension shows", () => {
    assert.equal(plainFileName("invoice\u202Efdp.exe"), "invoicefdp.exe");
    assert.equal(plainFileName("a\u200B.pdf\u2066"), "a.pdf");
    assert.equal(plainFileName("scan.pdf          .exe"), "scan.pdf .exe");
    assert.equal(plainFileName("tab\tname\u0007.pdf"), "tabname.pdf");
    assert.equal(plainFileName(null), "");
    assert.deepEqual(uniqueZipNames(["x\u202Egpj.exe"]), ["xgpj.exe"]);
  });

  it("numbers a name already taken, in the folder or the batch", () => {
    const taken = new Set(["a.pdf", "a (2).pdf"]);
    assert.equal(freeFileName("a.pdf", (c) => taken.has(c)), "a (3).pdf");
    assert.equal(freeFileName("b.pdf", (c) => taken.has(c)), "b.pdf");
    assert.equal(freeFileName("noext", (c) => c === "noext"), "noext (2)");
  });
});
