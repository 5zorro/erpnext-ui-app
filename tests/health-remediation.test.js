import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_HEALTH_REMEDIATION,
  normalizeHealthRemediationPrefs,
  isSafeNotifyUrl,
  isAllowedAutofixScriptPath,
  autofixReady,
  remediationUiState,
  applyRemediationSetup,
} from "../src/health-remediation.js";

describe("isSafeNotifyUrl", () => {
  it("allows https forms only", () => {
    assert.equal(isSafeNotifyUrl("https://docs.google.com/forms/d/e/x/viewform"), true);
    assert.equal(isSafeNotifyUrl("http://example.com/form"), false);
    assert.equal(isSafeNotifyUrl("file:///etc/passwd"), false);
    assert.equal(isSafeNotifyUrl("javascript:alert(1)"), false);
  });
});

describe("isAllowedAutofixScriptPath", () => {
  it("requires absolute paths and rejects empties", () => {
    assert.equal(isAllowedAutofixScriptPath("/home/pi/erpnext/frappe_docker/start-shell.sh"), true);
    assert.equal(isAllowedAutofixScriptPath("C:\\IT\\start-erp.bat"), true);
    assert.equal(isAllowedAutofixScriptPath("ops/start.sh"), false);
    assert.equal(isAllowedAutofixScriptPath(""), false);
    assert.equal(isAllowedAutofixScriptPath("./start.sh"), false);
  });
});

describe("normalize + autofixReady", () => {
  it("defaults to unset with no script", () => {
    const p = normalizeHealthRemediationPrefs(null);
    assert.deepEqual(p, EMPTY_HEALTH_REMEDIATION);
    assert.equal(autofixReady(p), false);
  });

  it("drops unsafe notify and relative scripts", () => {
    const p = normalizeHealthRemediationPrefs({
      mode: "autofix",
      notifyUrl: "http://evil",
      autofixScriptPath: "relative.sh",
    });
    assert.equal(p.notifyUrl, "");
    assert.equal(p.autofixScriptPath, "");
    assert.equal(autofixReady(p), false);
  });
});

describe("remediationUiState", () => {
  it("on bad + unset shows setup only (no Start ERPNext)", () => {
    const ui = remediationUiState(EMPTY_HEALTH_REMEDIATION, { status: "bad" });
    assert.equal(ui.showSetup, true);
    assert.equal(ui.showAutofix, false);
    assert.equal(ui.showNotify, false);
    assert.match(ui.hint, /no script/i);
  });

  it("on bad + autofix with path shows Start ERPNext", () => {
    const ui = remediationUiState(
      {
        mode: "autofix",
        notifyUrl: "",
        autofixScriptPath: "/opt/it/start-erp.sh",
        configuredAt: "2026-08-02",
      },
      { status: "bad" },
    );
    assert.equal(ui.showAutofix, true);
    assert.equal(ui.showFinishAutofixSetup, false);
  });

  it("on bad + notify with url shows Notify IT", () => {
    const ui = remediationUiState(
      {
        mode: "notify",
        notifyUrl: "https://docs.google.com/forms/d/e/x/viewform",
        autofixScriptPath: "",
        configuredAt: "2026-08-02",
      },
      { status: "bad" },
    );
    assert.equal(ui.showNotify, true);
  });
});

describe("applyRemediationSetup", () => {
  it("rejects notify without https", () => {
    const r = applyRemediationSetup(EMPTY_HEALTH_REMEDIATION, {
      mode: "notify",
      notifyUrl: "http://bad",
      nowIso: "2026-08-02T00:00:00Z",
    });
    assert.equal(r.ok, false);
  });

  it("accepts autofix absolute path", () => {
    const r = applyRemediationSetup(EMPTY_HEALTH_REMEDIATION, {
      mode: "autofix",
      autofixScriptPath: "/home/pi/erpnext/frappe_docker/start-shell.sh",
      nowIso: "2026-08-02T00:00:00Z",
    });
    assert.equal(r.ok, true);
    assert.equal(r.prefs.mode, "autofix");
    assert.equal(autofixReady(r.prefs), true);
  });

  it("clears with unset", () => {
    const r = applyRemediationSetup(
      { mode: "autofix", notifyUrl: "", autofixScriptPath: "/x.sh", configuredAt: "t" },
      { mode: "unset" },
    );
    assert.equal(r.ok, true);
    assert.equal(r.prefs.mode, "unset");
    assert.equal(r.prefs.autofixScriptPath, "");
  });
});
