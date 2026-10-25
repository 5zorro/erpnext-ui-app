import { test } from "node:test";
import assert from "node:assert/strict";
import { erpReloadUnderDoc, reloadNotice } from "../src/erp-reload-notice.js";

const BASE = "http://localhost:8080";
const base = {
  surfaceMode: "doc",
  shellLoading: false,
  docRoute: "/app/purchase-invoice/new-purchase-invoice-abc",
  loadedUrl: `${BASE}/desk/purchase-invoice/new-purchase-invoice-abc`,
  userEdited: true,
  docLabel: "bill",
  erpBase: BASE,
};

test("a reload of the form under a typed new Bill: it was never saved", () => {
  assert.deepEqual(erpReloadUnderDoc(base), {
    doctype: "purchase-invoice",
    typed: true,
    wasNew: true,
    notice: "ERPNext reloaded — this bill was never saved, so what you typed is gone.",
  });
});

test("a typed saved draft: the changes are gone, this is the saved draft", () => {
  const r = erpReloadUnderDoc({ ...base, docRoute: "/app/purchase-invoice/ACC-PINV-2026-00061", loadedUrl: `${BASE}/app/purchase-invoice/ACC-PINV-2026-00061` });
  assert.equal(r.notice, "ERPNext reloaded — your unsaved changes to ACC-PINV-2026-00061 are gone; this is the saved draft.");
  assert.equal(r.wasNew, false);
});

test("nothing typed: still a reload to repaint, but nothing to say", () => {
  const r = erpReloadUnderDoc({ ...base, userEdited: false });
  assert.equal(r.typed, false);
  assert.equal(r.notice, "");
});

test("a shell load started from Vanilla that lands under the Doc page is repainted, silently (N-7)", () => {
  assert.deepEqual(erpReloadUnderDoc({ ...base, shellLoading: true, shellLoadFrom: "erp" }), {
    doctype: "purchase-invoice",
    typed: false,
    wasNew: true,
    notice: "",
  });
});

test("not a reload under the Doc page: the Doc page's own load, another surface, another page", () => {
  assert.equal(erpReloadUnderDoc({ ...base, shellLoading: true, shellLoadFrom: "doc" }), null);
  assert.equal(erpReloadUnderDoc({ ...base, surfaceMode: "erp" }), null);
  assert.equal(erpReloadUnderDoc({ ...base, loadedUrl: `${BASE}/login` }), null);
  assert.equal(erpReloadUnderDoc({ ...base, loadedUrl: `${BASE}/app/supplier/X` }), null);
  assert.equal(erpReloadUnderDoc({ ...base, docRoute: "/app/purchase-invoice" }), null);
  assert.equal(erpReloadUnderDoc(null), null);
});

test("a reload during a save never claims it was not saved (R2-1: it may have landed)", () => {
  assert.equal(
    erpReloadUnderDoc({ ...base, midSave: true }).notice,
    "ERPNext reloaded during the save — it may or may not have saved. Look for this bill with Find before typing it again.",
  );
  assert.match(reloadNotice({ typed: false, wasNew: false, midSave: true, docLabel: "bill" }), /check that this bill has your changes/);
});

test("reloadNotice decodes the name and falls back to the label", () => {
  assert.match(reloadNotice({ typed: true, wasNew: false, name: "PO%20ONE", docLabel: "purchase order" }), /changes to PO ONE are gone/);
  assert.match(reloadNotice({ typed: true, wasNew: false, name: "", docLabel: "purchase order" }), /changes to this purchase order are gone/);
  assert.equal(reloadNotice({ typed: true, wasNew: true }), "ERPNext reloaded — this document was never saved, so what you typed is gone.");
});
