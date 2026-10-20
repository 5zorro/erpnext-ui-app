import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedErpUrl, erpUrl, isShellNavAllowed, offBaseNavigation, offBaseWarning } from "../src/nav-guard.js";

describe("isAllowedErpUrl", () => {
  const base = "http://localhost:8080";

  it("allows ERP origin and paths", () => {
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080"), true);
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080/desk"), true);
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080/login"), true);
  });

  it("allows blank/blob/data for print helpers", () => {
    assert.equal(isAllowedErpUrl(base, "about:blank"), true);
    assert.equal(isAllowedErpUrl(base, "blob:http://localhost:8080/x"), true);
    assert.equal(isAllowedErpUrl(base, "data:text/html,hi"), true);
  });

  it("blocks external sites", () => {
    assert.equal(isAllowedErpUrl(base, "https://evil.example/"), false);
    assert.equal(isAllowedErpUrl(base, "http://localhost:9090/desk"), false);
  });
});

describe("erpUrl", () => {
  it("joins base and route", () => {
    assert.equal(erpUrl("http://localhost:8080/", "/desk"), "http://localhost:8080/desk");
    assert.equal(erpUrl("http://localhost:8080", "login"), "http://localhost:8080/login");
  });

  it("encodes spaces in record names", () => {
    assert.equal(
      erpUrl("http://localhost:8080", "/app/tax-category/TAX EXEMPT"),
      "http://localhost:8080/app/tax-category/TAX%20EXEMPT",
    );
  });
});

// Architecture review 2026-10-19, R1-1: shell pages (preloads that save, pay, print) stay on their file.
describe("isShellNavAllowed", () => {
  const form = "file:///app/electron/doc-form.html";

  it("refuses a shell page going anywhere but its own file", () => {
    assert.equal(isShellNavAllowed(form, "https://example.com/"), false);
    assert.equal(isShellNavAllowed(form, "http://localhost:8080/desk"), false);
    assert.equal(isShellNavAllowed(form, "file:///home/me/Downloads/invoice.html"), false);
    assert.equal(isShellNavAllowed(form, "javascript:alert(1)"), false);
    assert.equal(isShellNavAllowed(form, "data:text/html,<b>x</b>"), false);
    assert.equal(isShellNavAllowed(form, ""), false);
  });

  it("allows the same file with another query or hash", () => {
    assert.equal(isShellNavAllowed(form, `${form}?doctype=Purchase%20Invoice`), true);
    assert.equal(isShellNavAllowed(`${form}?a=1`, `${form}#doc-taxes-block`), true);
  });

  it("a blank view goes nowhere by itself; http(s) pages are the ERP view's own guard's job", () => {
    assert.equal(isShellNavAllowed("about:blank", "file:///app/electron/find-doc.html"), false);
    assert.equal(isShellNavAllowed("", "https://example.com/"), false);
    assert.equal(isShellNavAllowed("http://localhost:8080/desk", "https://example.com/"), true);
  });
});

describe("main.js wires the shell navigation guard for every page", () => {
  it("web-contents-created denies windows and checks isShellNavAllowed, skipping only the ERP view", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
    const start = main.indexOf('app.on("web-contents-created"');
    assert.ok(start > 0);
    const body = main.slice(start, main.indexOf("\n});\n", start));
    assert.match(body, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
    assert.match(body, /contents === erp\.webContents\) return;/);
    assert.match(body, /isShellNavAllowed\(contents\.getURL\(\), url\)/);
    assert.ok(start < main.indexOf("app.whenReady()"), "registered before the first view exists");
  });
});

// Architecture review 2026-10-19, R1-3 (5zorro: warn, let the clerk click through).
describe("leaving ERPNext from the ERP view", () => {
  const base = "http://localhost:8080";

  it("sorts addresses: ERPNext, another website, or never opened", () => {
    assert.deepEqual(offBaseNavigation(base, "http://localhost:8080/app"), { kind: "erp" });
    assert.deepEqual(offBaseNavigation(base, "https://accounts.example.com/x?y=1"), { kind: "web", host: "accounts.example.com", url: "https://accounts.example.com/x?y=1" });
    assert.equal(offBaseNavigation(base, "http://localhost:8080.evil.com/").kind, "refuse"); // not a valid address at all
    assert.equal(offBaseNavigation(base, "http://localhost.evil.com:8080/").kind, "web");
    assert.equal(offBaseNavigation(base, "file:///etc/passwd").kind, "refuse");
    assert.equal(offBaseNavigation(base, "ms-msdt:/id").kind, "refuse");
    assert.equal(offBaseNavigation(base, "javascript:alert(1)").kind, "refuse");
    assert.equal(offBaseNavigation(base, "not a url").kind, "refuse");
  });

  it("a website gets go back (default) / browser / continue; anything else only OK", () => {
    const web = offBaseWarning(offBaseNavigation(base, "https://example.com/"));
    assert.deepEqual(web.actions, ["back", "browser", "continue"]);
    assert.equal(web.buttons.length, 3);
    assert.match(web.message, /example\.com/);
    const refused = offBaseWarning(offBaseNavigation(base, "file:///x"));
    assert.deepEqual(refused.actions, ["back"]);
    assert.match(refused.message, /"file:"/);
  });

  it("main.js guards redirects as well as links, and every injection goes through erpExec", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
    assert.match(main, /erp\.webContents\.on\("will-redirect"[\s\S]{0,400}warnOffBase\(url, "redirect"\)/);
    assert.match(main, /erp\.webContents\.on\("will-navigate"[\s\S]{0,300}warnOffBase\(url, "link"\)/);
    const direct = main.match(/erp\.webContents\.executeJavaScript\(/g) || [];
    assert.equal(direct.length, 1, "only erpExec itself may call executeJavaScript on the ERP view");
    const exec = main.slice(main.indexOf("function erpExec("), main.indexOf("function erpExec(") + 400);
    assert.match(exec, /!isAllowedErpUrl\(ERP_BASE, url\)/);
    // The ERP preload is on any page in that view, so its messages count only from ERPNext.
    const hop = main.slice(main.indexOf('ipcMain.on("erp-route-hop"'), main.indexOf('ipcMain.on("erp-route-hop"') + 400);
    assert.match(hop, /if \(!isAllowedErpUrl\(ERP_BASE, erp\.webContents\.getURL\(\)\)\) return;/);
  });
});
