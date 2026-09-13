/**
 * "Focus one payment at a time" for the Pay Outstanding flow view (Packet 4b).
 *
 * Why it exists: the two aggregate columns want opposite row orders, so on either sort one side's
 * strands necessarily cross (measured 2026-09-08 — see `pay-flow-sort.js` and section 2 of
 * `docs/mockups/pay-flow-shapes.html`). Rather than trying to out-clever the sort, focus makes the
 * crossings irrelevant: light one relationship and dim the rest, and it reads the same under
 * either sort.
 *
 * Pure: resolves *what* is in focus. Painting it is the page's job.
 */

/** @typedef {{ kind: "row"|"invoice"|"group", id: string }} FlowFocusTarget */
/** @typedef {{ keys: string[], invoiceIds: string[], groupIds: string[], active: boolean }} FlowFocus */

const EMPTY = Object.freeze({
  keys: Object.freeze([]),
  invoiceIds: Object.freeze([]),
  groupIds: Object.freeze([]),
  active: false,
});

const str = (v) => (v == null ? "" : String(v));

/** @param {{ id?: string, keys?: string[] }[]|null|undefined} items */
function normalizeIndexSide(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && str(it.id))
    .map((it) => ({ id: str(it.id), keys: (Array.isArray(it.keys) ? it.keys : []).map(str) }));
}

/**
 * Resolve a hover/click into the full set to light — always the whole chain across all five
 * columns, never just the thing under the cursor. Hovering one schedule row lights its invoice
 * *and* its suggested payment, which is exactly the question "where did this installment come
 * from and what will pay it" that the crossings otherwise make hard to answer.
 *
 * @param {FlowFocusTarget|null|undefined} target
 * @param {{ invoices?: { id: string, keys: string[] }[], groups?: { id: string, keys: string[] }[] }} index
 * @returns {FlowFocus}
 */
export function resolveFlowFocus(target, index = {}) {
  const kind = target && target.kind;
  const id = str(target && target.id);
  if (!id || (kind !== "row" && kind !== "invoice" && kind !== "group")) return EMPTY;

  const invoices = normalizeIndexSide(index.invoices);
  const groups = normalizeIndexSide(index.groups);

  /** @type {string[]} */
  let keys;
  if (kind === "row") {
    keys = [id];
  } else {
    const side = kind === "invoice" ? invoices : groups;
    const hit = side.find((it) => it.id === id);
    if (!hit) return EMPTY;
    keys = hit.keys;
  }
  if (!keys.length) return EMPTY;

  const keySet = new Set(keys);
  const touching = (side) => side.filter((it) => it.keys.some((k) => keySet.has(k))).map((it) => it.id);

  return {
    keys: [...keySet],
    invoiceIds: kind === "invoice" ? [id] : touching(invoices),
    groupIds: kind === "group" ? [id] : touching(groups),
    active: true,
  };
}

/** The no-focus value, so callers never have to build one. @returns {FlowFocus} */
export function noFlowFocus() {
  return EMPTY;
}

/**
 * Click-to-pin semantics: clicking the focused thing again releases it, clicking a different one
 * moves the pin. Kept here so the page has no branching state logic of its own.
 * @param {FlowFocusTarget|null} pinned
 * @param {FlowFocusTarget} clicked
 * @returns {FlowFocusTarget|null} the new pin
 */
export function togglePinnedFocus(pinned, clicked) {
  if (!clicked || !str(clicked.id)) return pinned || null;
  if (pinned && pinned.kind === clicked.kind && str(pinned.id) === str(clicked.id)) return null;
  return { kind: clicked.kind, id: str(clicked.id) };
}
