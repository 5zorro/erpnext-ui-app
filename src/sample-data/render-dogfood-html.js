/**
 * Render dogfood AP source docs to printable HTML (several “vendor template” skins).
 * Pure string builder — no DOM.
 */

import { sourceGrandTotal, sourceSubtotal } from "./dogfood-ap-sources.js";

/**
 * @param {import("./dogfood-ap-sources.js").DogfoodSourceDoc} doc
 * @returns {string}
 */
export function renderDogfoodSourceHtml(doc) {
  const sub = sourceSubtotal(doc);
  const tax = Number(doc.taxAmount) || 0;
  const grand = sourceGrandTotal(doc);
  const title = kindTitle(doc.kind);
  const skin = doc.template || "classic";

  const lines = (doc.lines || [])
    .map(
      (L) => `<tr>
      <td>${esc(L.sku)}</td>
      <td>${esc(L.description)}</td>
      <td class="num">${fmtQty(L.qty)}</td>
      <td class="num">${fmtMoney(L.rate)}</td>
      <td class="num">${fmtMoney(Number(L.qty) * Number(L.rate))}</td>
    </tr>`
    )
    .join("\n");

  const metaBits = [];
  if (doc.poNos?.length) metaBits.push(`<div><b>PO #:</b> ${esc(doc.poNos.join(", "))}</div>`);
  if (doc.packingNo) metaBits.push(`<div><b>Packing list #:</b> ${esc(doc.packingNo)}</div>`);
  if (doc.bolNo) metaBits.push(`<div><b>BOL #:</b> ${esc(doc.bolNo)}</div>`);
  if (doc.terms) metaBits.push(`<div><b>Terms:</b> ${esc(doc.terms)}</div>`);
  if (doc.vendor.accountNo)
    metaBits.push(`<div><b>Your account #:</b> ${esc(doc.vendor.accountNo)}</div>`);

  const notes = (doc.notes || [])
    .map((n) => `<li>${esc(n)}</li>`)
    .join("");
  const taxRow =
    doc.kind === "vendor_invoice"
      ? `<div class="tot-row"><span>Tax</span><span>${fmtMoney(tax)}</span></div>
         ${doc.taxNote ? `<div class="tax-note">${esc(doc.taxNote)}</div>` : ""}`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(doc.id)} — ${esc(title)} ${esc(doc.docNo)}</title>
<style>
${skinCss(skin)}
</style>
</head>
<body class="skin-${esc(skin)}">
  <header class="banner">
    <div class="dogfood">DOGFOOD SOURCE · ${esc(doc.id)} · OI-103${doc.oi103 != null ? "." + doc.oi103 : ""}</div>
    <div class="hint">${esc(doc.dogfoodHint)}</div>
  </header>

  <main>
    <div class="top">
      <div class="vendor">
        <div class="co">${esc(doc.vendor.legalName)}</div>
        ${doc.vendor.dba ? `<div class="dba">DBA: ${esc(doc.vendor.dba)}</div>` : ""}
        ${(doc.vendor.address || []).map((a) => `<div>${esc(a)}</div>`).join("")}
      </div>
      <div class="dochead">
        <h1>${esc(title)}</h1>
        <div><b>No.</b> ${esc(doc.docNo)}</div>
        <div><b>Date</b> ${esc(doc.docDate)}</div>
        ${metaBits.join("\n")}
      </div>
    </div>

    ${addrBlock("Ship from", doc.shipFrom)}
    ${addrBlock("Ship to", doc.shipTo)}

    <table class="lines">
      <thead>
        <tr><th>SKU</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${lines}
      </tbody>
    </table>

    <div class="totals">
      <div class="tot-row"><span>Subtotal</span><span>${fmtMoney(sub)}</span></div>
      ${taxRow}
      <div class="tot-row grand"><span>Total</span><span>${fmtMoney(grand)}</span></div>
    </div>

    ${notes ? `<ul class="notes">${notes}</ul>` : ""}
    <p class="scenario"><b>Scenario:</b> ${esc(doc.scenario)}</p>
  </main>
  <footer>Synthetic vendor paper for erpnext-ui-app dogfood — not a real invoice.</footer>
</body>
</html>`;
}

/**
 * @param {string} label
 * @param {{ name: string, address: string[] }|undefined} block
 */
function addrBlock(label, block) {
  if (!block) return "";
  return `<div class="addr">
    <div class="addr-label">${esc(label)}</div>
    <div class="addr-name">${esc(block.name)}</div>
    ${(block.address || []).map((a) => `<div>${esc(a)}</div>`).join("")}
  </div>`;
}

/** @param {string} kind */
function kindTitle(kind) {
  if (kind === "purchase_order") return "Purchase Order";
  if (kind === "packing_list") return "Packing List";
  return "Invoice";
}

/** @param {number} n */
function fmtMoney(n) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** @param {number} n */
function fmtQty(n) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** @param {string} s */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} skin */
function skinCss(skin) {
  const base = `
    @page { margin: 0.6in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 0; padding: 0; }
    .banner { background: #1e293b; color: #e2e8f0; padding: 8px 12px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; }
    .banner .hint { color: #94a3b8; margin-top: 4px; }
    .dogfood { font-weight: 700; letter-spacing: 0.04em; }
    main { padding: 16px 20px 32px; }
    .top { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 16px; }
    .co { font-size: 1.25rem; font-weight: 700; }
    .dba { font-style: italic; margin-bottom: 4px; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    .addr { margin: 8px 0; padding: 8px; border: 1px solid #cbd5e1; display: inline-block; min-width: 220px; vertical-align: top; margin-right: 12px; }
    .addr-label { font-size: 11px; text-transform: uppercase; color: #64748b; }
    .addr-name { font-weight: 700; }
    table.lines { width: 100%; border-collapse: collapse; margin-top: 16px; }
    table.lines th, table.lines td { border-bottom: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    table.lines th { font-size: 12px; text-transform: uppercase; color: #475569; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 12px; margin-left: auto; width: 260px; }
    .tot-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .tot-row.grand { font-weight: 700; border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; }
    .tax-note { font-size: 12px; color: #64748b; text-align: right; }
    .notes { margin-top: 16px; }
    .scenario { margin-top: 20px; font-size: 13px; color: #334155; font-family: ui-sans-serif, system-ui, sans-serif; }
    footer { font-size: 10px; color: #94a3b8; padding: 8px 20px 16px; font-family: ui-sans-serif, system-ui, sans-serif; }
    @media print {
      .banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
  if (skin === "grid") {
    return (
      base +
      `
      body.skin-grid { font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif; }
      table.lines th, table.lines td { border: 1px solid #94a3b8; }
      h1 { color: #0f766e; }
    `
    );
  }
  if (skin === "plain") {
    return (
      base +
      `
      body.skin-plain { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 13px; }
      .banner { background: #334155; }
      table.lines th { border-bottom: 2px solid #111; }
    `
    );
  }
  if (skin === "ack") {
    return (
      base +
      `
      body.skin-ack { font-family: "Palatino Linotype", Palatino, serif; }
      h1 { letter-spacing: 0.08em; text-transform: uppercase; font-size: 1.2rem; }
      .co { color: #1e3a5f; }
    `
    );
  }
  return base;
}
