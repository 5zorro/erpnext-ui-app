import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRINT_QUEUE_MAX,
  printviewUrl,
  pdfUrl,
  multiPdfUrl,
  classifyErpPrintUrl,
  printBlockReason,
  printerPurposeFor,
  mergePrintPrefs,
  rememberPrintChoice,
  addToPrintQueue,
  removeFromPrintQueue,
  groupPrintQueue,
  pdfFileName,
  summarizePrintResults,
  sortPrintersByRecent,
  RECENT_PRINTERS_MAX,
  isCheckModeOfPayment,
  printerLabel,
  diagnosePrintFailure,
} from "../src/print-service.js";

const BASE = "http://localhost:8080";
const bill = { doctype: "Purchase Invoice", name: "ACC-PINV-2026-00001", format: "Purchase Invoice Standard" };

describe("print-service — ERPNext renders, the shell delivers", () => {
  it("prints ERPNext's own print view, without the auto-print flag", () => {
    const u = new URL(printviewUrl(BASE, bill));
    assert.equal(u.pathname, "/printview");
    assert.equal(u.searchParams.get("doctype"), "Purchase Invoice");
    assert.equal(u.searchParams.get("format"), "Purchase Invoice Standard");
    assert.equal(u.searchParams.get("no_letterhead"), "0");
    assert.equal(u.searchParams.has("trigger_print"), false, "Electron prints it — no window.print in the page");
  });

  it("files come from ERPNext's PDF endpoints, one or merged", () => {
    assert.match(pdfUrl(BASE, bill), /\/api\/method\/frappe\.utils\.print_format\.download_pdf\?/);
    const one = new URL(multiPdfUrl(BASE, [bill, { doctype: "Purchase Invoice", name: "ACC-PINV-2026-00002" }]));
    assert.equal(one.searchParams.get("doctype"), "Purchase Invoice");
    assert.deepEqual(JSON.parse(one.searchParams.get("name")), ["ACC-PINV-2026-00001", "ACC-PINV-2026-00002"]);
    const mixed = new URL(multiPdfUrl(BASE, [bill, { doctype: "Payment Entry", name: "ACC-PAY-1" }]));
    assert.deepEqual(JSON.parse(mixed.searchParams.get("doctype")), {
      "Purchase Invoice": ["ACC-PINV-2026-00001"],
      "Payment Entry": ["ACC-PAY-1"],
    });
  });
});

// The popup 5zorro remembered: Frappe's Print / PDF buttons window.open these.
describe("classifyErpPrintUrl — what Frappe tried to open", () => {
  it("recognizes Frappe's Print button (render_page with trigger_print)", () => {
    const c = classifyErpPrintUrl(
      `${BASE}/printview?doctype=Purchase%20Invoice&name=ACC-PINV-2026-00001&trigger_print=1&format=Standard&no_letterhead=0&letterhead=&settings=%7B%7D&pdf_generator=wkhtmltopdf`,
      BASE,
    );
    assert.equal(c.kind, "printview");
    assert.deepEqual(c.items.map((i) => i.name), ["ACC-PINV-2026-00001"]);
    assert.equal(c.format, "Standard");
  });

  it("recognizes the PDF button and the list view's bulk print", () => {
    assert.equal(classifyErpPrintUrl(pdfUrl(BASE, bill), BASE).kind, "pdf");
    const multi = classifyErpPrintUrl(multiPdfUrl(BASE, [bill, { doctype: "Payment Entry", name: "P1" }]), BASE);
    assert.equal(multi.kind, "multi-pdf");
    assert.deepEqual(multi.items.map((i) => `${i.doctype}/${i.name}`), ["Purchase Invoice/ACC-PINV-2026-00001", "Payment Entry/P1"]);
  });

  it("leaves everything else alone, and never another origin", () => {
    assert.equal(classifyErpPrintUrl(`${BASE}/app/purchase-invoice/X`, BASE), null);
    assert.equal(classifyErpPrintUrl("http://evil.example/printview?doctype=A&name=B", BASE), null);
    assert.equal(classifyErpPrintUrl("not a url", BASE), null);
  });
});

describe("printBlockReason — say it before ERPNext refuses", () => {
  const settings = { allow_print_for_draft: 1, allow_print_for_cancelled: 0 };
  it("unsaved → save first; cancelled → refused; drafts follow the site", () => {
    assert.match(printBlockReason({ name: "new-purchase-invoice-x", docstatus: 0 }, settings), /Save it first/);
    assert.match(printBlockReason({ name: "A", docstatus: 2 }, settings), /cancelled/);
    assert.equal(printBlockReason({ name: "A", docstatus: 0 }, settings), "");
    assert.match(printBlockReason({ name: "A", docstatus: 0 }, { allow_print_for_draft: 0 }), /drafts/);
    assert.equal(printBlockReason({ name: "A", docstatus: 1 }, settings), "");
  });
});

describe("remembered choices — never written to the site", () => {
  it("one printer per purpose: checks, invoices, everything else", () => {
    assert.equal(printerPurposeFor("Payment Entry"), "checks");
    assert.equal(printerPurposeFor("Sales Invoice"), "invoices");
    assert.equal(printerPurposeFor("Purchase Invoice"), "documents");
    let p = rememberPrintChoice(mergePrintPrefs(null), { doctype: "Payment Entry", deviceName: "CheckPrinter", format: "Bank A Check" });
    p = rememberPrintChoice(p, { doctype: "Purchase Invoice", deviceName: "Office", withLetterhead: false });
    assert.deepEqual(p.printers, { checks: "CheckPrinter", documents: "Office" });
    assert.deepEqual(p.formats, { "Payment Entry": "Bank A Check" });
    assert.deepEqual(p.letterhead, { "Purchase Invoice": false });
    assert.deepEqual(rememberPrintChoice(p, { doctype: "Payment Entry", format: "" }).formats, {});
  });

  it("drops junk from a stored file", () => {
    assert.deepEqual(mergePrintPrefs({ printers: { checks: 5 }, formats: [], letterhead: { A: "yes" } }), {
      printers: {},
      formats: {},
      letterhead: {},
      recentPrinters: [],
    });
  });
});

describe("the print queue", () => {
  it("one entry per document; adding again updates it", () => {
    let { queue, added } = addToPrintQueue([], [bill, bill, { doctype: "Purchase Invoice", name: "" }]);
    assert.equal(added, 1);
    ({ queue } = addToPrintQueue(queue, [{ ...bill, format: "Other" }]));
    assert.equal(queue.length, 1);
    assert.equal(queue[0].format, "Other");
    assert.deepEqual(removeFromPrintQueue(queue, [bill]), []);
  });

  it("stops at Frappe's own bulk limit", () => {
    const many = Array.from({ length: PRINT_QUEUE_MAX + 3 }, (_, i) => ({ doctype: "Payment Entry", name: `P${i}` }));
    const r = addToPrintQueue([], many);
    assert.equal(r.queue.length, PRINT_QUEUE_MAX);
    assert.equal(r.refused, 3);
  });

  it("groups by doctype + format + letter head, keeping the order added", () => {
    const q = [
      { doctype: "Payment Entry", name: "P2", format: "Check" },
      bill,
      { doctype: "Payment Entry", name: "P1", format: "Check" },
    ];
    const g = groupPrintQueue(q);
    assert.equal(g.length, 2);
    assert.deepEqual(g[0].items.map((i) => i.name), ["P2", "P1"]);
  });
});

describe("file names and results", () => {
  it("a document's PDF is named after it, made safe", () => {
    assert.equal(pdfFileName("ACC-PINV-2026-00001"), "ACC-PINV-2026-00001.pdf");
    assert.equal(pdfFileName("SUMMIT TRADERS / 7"), "SUMMIT-TRADERS-7.pdf");
  });

  it("a batch reports which document failed and why", () => {
    const s = summarizePrintResults(
      [
        { item: { doctype: "Payment Entry", name: "P1" }, ok: true },
        { item: { doctype: "Payment Entry", name: "P2" }, ok: false, reason: "printer offline" },
      ],
      "Printed",
    );
    assert.equal(s, "Printed 1 of 2 — P2: printer offline");
    assert.equal(summarizePrintResults([{ item: bill, ok: true }], "Saved"), "Saved 1 of 1.");
  });
});

// 5zorro 2026-10-03: "remember the top 3 most recently used printers and sort those to the top".
describe("recent printers", () => {
  it("keeps the last three used, newest first, without repeats", () => {
    let p = mergePrintPrefs(null);
    for (const d of ["A", "B", "C", "B", "D"]) p = rememberPrintChoice(p, { doctype: "Purchase Invoice", deviceName: d });
    assert.equal(RECENT_PRINTERS_MAX, 3);
    assert.deepEqual(p.recentPrinters, ["D", "B", "C"]);
    assert.deepEqual(rememberPrintChoice(p, { doctype: "Purchase Invoice", deviceName: "" }).recentPrinters, ["D", "B", "C"]);
  });

  it("sorts them to the top of the menu; a printer this computer lost is not shown", () => {
    const printers = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];
    assert.deepEqual(sortPrintersByRecent(printers, ["C", "GONE", "A"]).map((p) => p.name), ["C", "A", "B", "D"]);
    assert.deepEqual(sortPrintersByRecent(printers, []).map((p) => p.name), ["A", "B", "C", "D"]);
  });
});

describe("check runs and printer labels", () => {
  it("a payment by check goes to the print queue", () => {
    for (const m of ["Check", "Cheque", "USPS_Check", "Checks"]) assert.equal(isCheckModeOfPayment(m), true, m);
    for (const m of ["ACH", "Wire Transfer", "Cash", "", null, "Checking account transfer"]) assert.equal(isCheckModeOfPayment(m), false, String(m));
  });

  // 5zorro 2026-10-03: printer names were cut off; the network address tells two apart.
  it("shows the full name and, when the system says, the address", () => {
    assert.deepEqual(printerLabel({ name: "HP_LaserJet_M404", displayName: "HP LaserJet M404 (Front office)", options: { "device-uri": "ipp://192.168.1.40/ipp/print" } }), {
      label: "HP LaserJet M404 (Front office) — ipp://192.168.1.40/ipp/print",
      address: "ipp://192.168.1.40/ipp/print",
    });
    assert.deepEqual(printerLabel({ name: "PDF", options: {} }), { label: "PDF", address: "" });
  });
});

// 5zorro 2026-10-03: "ideally this app will self heal from stuff like that common docker issue".
describe("diagnosePrintFailure — who can fix it", () => {
  it("the Docker problem found 2026-10-03 is an engine fault the shell heals, with IT's fix", () => {
    const d = diagnosePrintFailure("ERPNext: wkhtmltopdf reported an error: Exit with code 1 due to network error: ConnectionRefusedError");
    assert.equal(d.kind, "engine");
    assert.match(d.fix, /host_name/);
    assert.equal(diagnosePrintFailure("ERPNext: OSError").kind, "engine");
    assert.equal(diagnosePrintFailure("ERPNext did not return a PDF (500).").kind, "engine");
  });

  it("ERPNext's rules pass through — never healed around", () => {
    assert.equal(diagnosePrintFailure("ERPNext: Not allowed to print cancelled documents").kind, "rule");
    assert.equal(diagnosePrintFailure("ERPNext: Not allowed to print draft documents").kind, "rule");
  });

  it("a lost session and a printer problem are named as such", () => {
    assert.equal(diagnosePrintFailure("ERPNext did not return a PDF (401).").kind, "session");
    assert.equal(diagnosePrintFailure("Invalid deviceName provided").kind, "printer");
    assert.equal(diagnosePrintFailure("something odd").kind, "unknown");
  });
});

