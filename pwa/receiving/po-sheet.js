// Blind receiving sheet page (plan 2026-09-21, P1d). Reads one purchase order from ERPNext through
// the receiving proxy, builds the sheet with the same pure code the tests prove carries no
// quantity, and prints it. Every value goes into the page as text or as drawn bars — never as
// markup — because the page shares ERPNext's signed-in session.
import { buildBlindPoSheet } from "./lib/blind-po-sheet.js";
import { code128Bars } from "./lib/code128.js";
import { purchaseOrderPath, readFailure, signInPath } from "./lib/erp-read.js";
import { checkLabelPrefix } from "./lib/label-payload.js";

// Narrowest bar, in millimetres. 0.33 mm is a common size for office laser printers and handheld
// scanners; it is also the number the width measurement (plan P1e) is taken at.
const MODULE_MM = 0.33;
const LINE_CODE_HEIGHT_MM = 10;
const ORDER_CODE_HEIGHT_MM = 12;
const PREFIX_KEY = "receiving.labelPrefix";
const SVG_NS = "http://www.w3.org/2000/svg";

const $ = (id) => document.getElementById(id);

function remembered(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience; the field still works.
  }
}

function say(text, link) {
  const message = $("message");
  message.replaceChildren(document.createTextNode(text));
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.text;
    message.append(" ", a);
  }
}

/** A Code 128 symbol drawn as SVG rectangles, sized in millimetres for print. */
function barcode(text, heightMm) {
  const { totalModules, bars } = code128Bars(text);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "barcode");
  svg.setAttribute("viewBox", `0 0 ${totalModules} 1`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("width", `${(totalModules * MODULE_MM).toFixed(2)}mm`);
  svg.setAttribute("height", `${heightMm}mm`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", text);
  for (const bar of bars) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", bar.x);
    rect.setAttribute("y", 0);
    rect.setAttribute("width", bar.width);
    rect.setAttribute("height", 1);
    svg.append(rect);
  }
  return svg;
}

function cell(className, ...children) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.append(...children);
  return td;
}

function text(className, value) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = value;
  return span;
}

function render(sheet) {
  $("s-supplier").textContent = sheet.supplier;
  $("s-order").textContent = sheet.orderNumber;
  $("s-date").textContent = sheet.orderDate;
  $("s-lines").textContent = String(sheet.lineCount);

  const orderCode = $("s-order-code");
  orderCode.replaceChildren();
  if (sheet.orderBarcode) {
    const caption = document.createElement("figcaption");
    caption.textContent = sheet.orderBarcode;
    orderCode.append(barcode(sheet.orderBarcode, ORDER_CODE_HEIGHT_MM), caption);
  }

  $("s-rows").replaceChildren(
    ...sheet.lines.map((line) => {
      const tr = document.createElement("tr");
      const code = line.payload
        ? cell("", barcode(line.payload, LINE_CODE_HEIGHT_MM), text("code-text", line.payload))
        : cell("no-code", "No barcode — key in by hand");
      const item = cell("", text("item-number", line.itemNumber), document.createElement("br"), line.description);
      tr.append(cell("n", String(line.lineNumber)), code, item, cell("", line.unit), cell("count"));
      return tr;
    }),
  );

  const byHand = $("s-by-hand");
  byHand.hidden = sheet.keyedByHand.length === 0;
  byHand.textContent = `Lines ${sheet.keyedByHand.join(", ")} have item numbers no label can carry; the phone will ask for them to be typed.`;

  $("sheet").hidden = false;
  $("print").disabled = false;
}

async function show(event) {
  event.preventDefault();
  $("print").disabled = true;
  $("sheet").hidden = true;

  const prefix = checkLabelPrefix($("prefix").value);
  if (!prefix.ok) return say(prefix.reason);
  $("prefix").value = prefix.prefix;
  remember(PREFIX_KEY, prefix.prefix);

  const orderNumber = $("order").value.trim();
  if (!orderNumber) return say("Type or scan an order number.");

  say("Reading the order…");
  let response;
  try {
    response = await fetch(purchaseOrderPath(orderNumber), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return say(readFailure(0, orderNumber).message);
  }
  if (!response.ok) {
    const failure = readFailure(response.status, orderNumber);
    const here = location.pathname;
    return failure.kind === "sign-in"
      ? say(failure.message, { href: signInPath(here), text: "Sign in" })
      : say(failure.message);
  }

  let po;
  try {
    po = (await response.json()).data;
  } catch {
    return say(readFailure(502, orderNumber).message);
  }
  try {
    render(buildBlindPoSheet(po, { prefix: prefix.prefix }));
    say("");
  } catch (err) {
    say(err.message.replace(/^blind sheet: /, ""));
  }
}

$("prefix").value = remembered(PREFIX_KEY) || "";
$("controls").addEventListener("submit", show);
$("print").addEventListener("click", () => window.print());
