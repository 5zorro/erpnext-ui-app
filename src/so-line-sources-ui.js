/**
 * The Sources column's cells on the Sales Order (plan 2026-10-12 S4): one chip per source, in its
 * document's wash, A/P documents hatched when the clerk hatches A/P (as Home and the Bill's
 * Sales order(s) cells do), each a peek to its document. The rule is src/so-line-sources.js.
 */
import { soLineSources, SOURCE_PART_WASH_ROLE, SOURCE_PART_DESK } from "./so-line-sources.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @param {import("./so-line-sources.js").LineSources|undefined} entry
 * @param {boolean} loading
 * @returns {string}
 */
export function sourcesCellHtml(entry, loading) {
  if (!entry) return loading ? `<span class="ro src-chip-wait">…</span>` : "";
  return entry.parts
    .map((p) => {
      const role = SOURCE_PART_WASH_ROLE[p.kind] || "";
      const desk = SOURCE_PART_DESK[p.kind] || "";
      const text = `<span class="hatch-clear">${esc(p.label)}</span>`;
      if (p.route) {
        return `<button type="button" class="src-chip" data-role="${role}" data-desk="${desk}" data-kind="${p.kind}" data-peek-route="${esc(p.route)}" title="Peek at ${esc(p.name || "")}">${text}</button>`;
      }
      return `<span class="src-chip" data-role="${role}" data-desk="${desk}" data-kind="${p.kind}">${text}</span>`;
    })
    .join("");
}

/**
 * @param {{
 *   api: { soLineSources: Function },
 *   getDoc: () => any,
 *   root: () => HTMLElement|null,
 *   onPeek: (route: string) => void,
 *   onFilled?: () => void,
 * }} opts
 */
export function mountLineSources(opts) {
  /** @type {Record<string, import("./so-line-sources.js").LineSources>} */
  let byLine = {};
  let loadedFor = "";
  let loading = false;
  let token = 0;

  function fill() {
    const host = opts.root();
    if (!host) return;
    host.querySelectorAll("td[data-sources-line]").forEach((td) => {
      td.innerHTML = sourcesCellHtml(byLine[td.getAttribute("data-sources-line") || ""], loading);
    });
    host.querySelectorAll("td[data-sources-line] [data-peek-route]").forEach((b) => {
      /** @type {HTMLElement} */ (b).onclick = () => opts.onPeek(b.getAttribute("data-peek-route") || "");
    });
    // The chips arrive after the table was laid out: let it measure again (and grow to the right,
    // as the Bill's does, when they need the room).
    if (opts.onFilled) opts.onFilled();
  }

  /** Read the sources again — on a new document, or when forced (back from a peek, after Create). */
  async function refresh(force = false) {
    const doc = opts.getDoc();
    const name = doc && doc.name ? String(doc.name) : "";
    const key = `${name}\u0000${(doc && doc.modified) || ""}`;
    if (!name || /^new(-|$)/i.test(name)) {
      byLine = {};
      loadedFor = "";
      fill();
      return;
    }
    if (!force && key === loadedFor) {
      fill();
      return;
    }
    loadedFor = key;
    const mine = ++token;
    loading = true;
    fill();
    const items = Array.isArray(doc.items) ? doc.items : [];
    const res = await opts.api.soLineSources(name, items.map((i) => i.item_code)).catch(() => null);
    if (mine !== token) return;
    loading = false;
    byLine = res && res.ok ? soLineSources({ items, ...res.data }) : {};
    fill();
  }

  return { refresh, fill, cellHtml: (lineName) => sourcesCellHtml(byLine[lineName], loading) };
}
