/**
 * Nested peeks under a parent form (OI-128 approach A; who-is-a-parent: plan 2026-09-26 N1).
 * One ERP WebContents; Recent folds each parent's children into a dropdown under its row.
 * Collapse = clear this stack; the child → parent links (`syncPeekLinks`) keep the dropdown.
 */
import { normalizeAppRoute, routesReferToSameDoc } from "./route-info.js";
import { historyLabelFor } from "./history.js";
import {
  classifyHistoryOpen,
  decorateHistoryEntry,
  isSoftPeekRoute,
} from "./history-nav.js";

/** Siblings under one parent; keeps the live tree inside Recent (RECENT_MAX 7). */
export const PEEK_CHILD_CAP = 5;

/**
 * @typedef {{ route: string, label: string, dt: string, detail?: string, reopen?: boolean }} PeekRef
 *   `reopen`: the parent is not loaded behind the peek (opened from a Recent dropdown), so Esc
 *   reopens it in the clerk's preferred lens instead of stepping back in place.
 * @typedef {{ parent: PeekRef, children: PeekRef[] }} PeekStack
 */

/**
 * @param {unknown} stack
 * @returns {boolean}
 */
export function isActivePeekStack(stack) {
  return !!(stack && typeof stack === "object" && stack.parent && stack.parent.route);
}

/**
 * @param {string} routeOrUrl
 * @param {Array<{ route?: string, label?: string, dt?: string, detail?: string }>} [history]
 * @param {string} [erpBase]
 * @returns {PeekRef}
 */
export function peekRefFromRoute(routeOrUrl, history, erpBase) {
  const classified = classifyHistoryOpen(routeOrUrl, erpBase);
  const path = classified.path || "/";
  const list = Array.isArray(history) ? history : [];
  const found = list.find((h) => h && routesReferToSameDoc(h.route || "", path, erpBase));
  if (found) {
    return {
      // Recent may hold the generic `/new` for this draft; keep the exact address given, or a
      // return to the parent would make Frappe start a fresh draft (plan 2026-09-26 N1/N4).
      route: path,
      label: found.label != null ? String(found.label) : "",
      dt: found.dt != null ? String(found.dt) : classified.doctype,
      detail: found.detail != null ? String(found.detail) : "",
    };
  }
  const label = historyLabelFor(classified.doctype, classified.record) || classified.doctype || "";
  return {
    route: path,
    label,
    dt: classified.doctype || "",
    detail: classified.kind === "setup" ? "setup" : classified.record || "",
  };
}

/**
 * A peek child is a setup/master *record* (Supplier, Address, Tax Category, a Payment Entry…).
 * A list is somewhere you went, not something you glanced at.
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isPeekChildRoute(routeOrUrl, erpBase) {
  if (!isSoftPeekRoute(routeOrUrl, erpBase)) return false;
  return !!normalizeAppRoute(routeOrUrl, erpBase).record;
}

/**
 * Start or keep a peek parent. A different parent starts a fresh child list.
 * @param {PeekStack|null|undefined} stack
 * @param {PeekRef|string} parent
 * @param {{ erpBase?: string, history?: object[], reopen?: boolean }} [opts]
 * @returns {PeekStack|null}
 */
export function beginPeekParent(stack, parent, opts = {}) {
  const base =
    parent && typeof parent === "object" && parent.route
      ? peekRefFromRoute(parent.route, opts.history, opts.erpBase)
      : peekRefFromRoute(parent, opts.history, opts.erpBase);
  const ref = opts.reopen ? { ...base, reopen: true } : base;
  if (!ref.route || ref.route === "/") return stack && isActivePeekStack(stack) ? stack : null;
  if (stack && isActivePeekStack(stack) && routesReferToSameDoc(stack.parent.route, ref.route, opts.erpBase)) {
    return { parent: { ...stack.parent, ...ref }, children: stack.children.slice() };
  }
  return { parent: ref, children: [] };
}

/**
 * Add a depth-1 sibling under the current parent (not a peek-of-peek).
 * @param {PeekStack|null|undefined} stack
 * @param {PeekRef|string} child
 * @param {{ erpBase?: string, history?: object[], cap?: number }} [opts]
 * @returns {PeekStack|null}
 */
export function pushPeekChild(stack, child, opts = {}) {
  if (!isActivePeekStack(stack)) return stack ? stack : null;
  const ref =
    child && typeof child === "object" && child.route
      ? peekRefFromRoute(child.route, opts.history, opts.erpBase)
      : peekRefFromRoute(child, opts.history, opts.erpBase);
  if (!ref.route || ref.route === "/") return stack;
  if (!isPeekChildRoute(ref.route, opts.erpBase)) return stack;
  if (routesReferToSameDoc(stack.parent.route, ref.route, opts.erpBase)) return stack;

  const cap = opts.cap ?? PEEK_CHILD_CAP;
  const rest = stack.children.filter((c) => !routesReferToSameDoc(c.route, ref.route, opts.erpBase));
  rest.push(ref);
  const children = rest.length > cap ? rest.slice(rest.length - cap) : rest;
  return { parent: stack.parent, children };
}

/**
 * Leaving the parent session (Home, other Doc, report, hard Vanilla) clears the tree.
 * Esc back to the parent, or another setup peek, keeps it.
 * @param {PeekStack|null|undefined} stack
 * @param {string} nextRoute
 * @param {{ erpBase?: string, hardLeave?: boolean }} [opts]
 * @returns {boolean}
 */
export function shouldCollapsePeekStack(stack, nextRoute, opts = {}) {
  if (!isActivePeekStack(stack)) return false;
  if (opts.hardLeave) return true;
  const path = normalizeAppRoute(nextRoute, opts.erpBase).path || "";
  if (!path || path === "/" || path === "/desk" || path === "/login" || path === "/app") return true;
  if (routesReferToSameDoc(stack.parent.route, path, opts.erpBase)) return false;
  if (isSoftPeekRoute(path, opts.erpBase)) return false;
  return true;
}

/**
 * @returns {null}
 */
export function collapsePeekStack() {
  return null;
}

/** How many child → parent links Recent remembers (in memory, like Recent itself). */
export const PEEK_LINK_CAP = 40;

/**
 * @typedef {Record<string, string>} PeekLinks child path → parent path
 */

/**
 * Remember which parent each child was peeked under, so Recent can keep folding it there after
 * the session ends. A child later opened outside any session under that parent stops being one.
 * @param {PeekLinks|null|undefined} links
 * @param {PeekStack|null|undefined} stack the stack *after* the hop
 * @param {string} [toRoute] where the hop landed
 * @param {string} [erpBase]
 * @returns {PeekLinks}
 */
export function syncPeekLinks(links, stack, toRoute, erpBase) {
  const next = { ...(links || {}) };
  const live = isActivePeekStack(stack);
  const parentPath = live ? normalizeAppRoute(stack.parent.route, erpBase).path : "";
  if (live) {
    for (const c of stack.children) {
      const childPath = normalizeAppRoute(c.route, erpBase).path;
      for (const k of Object.keys(next)) {
        if (routesReferToSameDoc(k, childPath, erpBase)) delete next[k];
      }
      next[childPath] = parentPath;
    }
  }
  if (toRoute) {
    const to = normalizeAppRoute(toRoute, erpBase).path;
    const inSession =
      live &&
      (routesReferToSameDoc(parentPath, to, erpBase) ||
        stack.children.some((c) => routesReferToSameDoc(c.route, to, erpBase)));
    if (!inSession) {
      for (const k of Object.keys(next)) {
        if (routesReferToSameDoc(k, to, erpBase)) delete next[k];
      }
    }
  }
  const keys = Object.keys(next);
  if (keys.length > PEEK_LINK_CAP) {
    for (const k of keys.slice(0, keys.length - PEEK_LINK_CAP)) delete next[k];
  }
  return next;
}

/**
 * Recent rows with each parent's children folded under it (`peekChildren`), instead of as rows
 * of their own. The live session's parent is pinned first with its dropdown open (`peekLive`).
 * A child whose parent is no longer in Recent is an ordinary row.
 * @param {object[]} history
 * @param {PeekStack|null|undefined} stack
 * @param {string} [erpBase]
 * @param {PeekLinks} [links]
 * @returns {object[]}
 */
export function applyPeekTreeToHistory(history, stack, erpBase, links = {}) {
  const list = Array.isArray(history) ? history.filter((h) => h && h.route) : [];
  const plain = (h) => ({
    ...h,
    treeRole: null,
    treeDepth: 0,
    treeParentLabel: "",
    peekChildren: [],
    peekLive: false,
  });
  const live = isActivePeekStack(stack);
  const same = (a, b) => routesReferToSameDoc(a, b, erpBase);
  const linkParentOf = (route) => {
    for (const [child, parent] of Object.entries(links || {})) {
      if (same(child, route)) return parent;
    }
    return "";
  };

  /** @type {{ route: string, entry: object, live: boolean }[]} */
  const parents = [];
  if (live) {
    const parentPath = normalizeAppRoute(stack.parent.route, erpBase).path;
    const fromHist = list.find((h) => same(h.route, parentPath));
    parents.push({
      route: parentPath,
      live: true,
      entry: decorateHistoryEntry(
        fromHist
          ? { ...fromHist }
          : {
              route: parentPath,
              dt: stack.parent.dt,
              label: stack.parent.label,
              detail: stack.parent.detail || "",
            },
        erpBase,
      ),
    });
  }
  for (const h of list) {
    if (parents.some((p) => same(p.route, h.route))) continue;
    if (list.some((c) => !same(c.route, h.route) && same(linkParentOf(c.route), h.route))) {
      parents.push({ route: h.route, live: false, entry: h });
    }
  }

  const asChild = (entry, parentLabel) => ({
    ...entry,
    treeRole: "child",
    treeDepth: 1,
    treeParentLabel: parentLabel || "document",
  });
  const nested = [];
  const childrenOf = (p) => {
    const label = p.entry.label || "document";
    const out = [];
    const seen = (route) => out.some((c) => same(c.route, route));
    if (p.live) {
      // Newest first, like every other list in Recent.
      for (const c of stack.children.slice().reverse()) {
        const path = normalizeAppRoute(c.route, erpBase).path;
        const fromHist = list.find((h) => same(h.route, path));
        const entry = decorateHistoryEntry(
          fromHist
            ? { ...fromHist }
            : { route: path, dt: c.dt, label: c.label, detail: c.detail || "setup", detailMuted: true },
          erpBase,
        );
        out.push(asChild(entry, label));
      }
    }
    for (const h of list) {
      if (seen(h.route) || same(h.route, p.route)) continue;
      if (parents.some((q) => same(q.route, h.route))) continue;
      if (same(linkParentOf(h.route), p.route)) out.push(asChild(decorateHistoryEntry({ ...h }, erpBase), label));
    }
    for (const c of out) nested.push(c.route);
    return out;
  };

  const parentRows = new Map();
  for (const p of parents) {
    parentRows.set(p.route, {
      ...plain(p.entry),
      treeRole: "parent",
      peekLive: p.live,
      peekChildren: childrenOf(p),
    });
  }

  const rows = [];
  const liveParent = live ? parents[0] : null;
  if (liveParent) rows.push(parentRows.get(liveParent.route));
  for (const h of list) {
    if (liveParent && same(h.route, liveParent.route)) continue;
    if (nested.some((r) => same(r, h.route))) continue;
    const p = parents.find((q) => same(q.route, h.route));
    rows.push(p ? parentRows.get(p.route) : plain(h));
  }
  return rows;
}

/**
 * Esc while soft-peeking: child → parent first; only resume parked Doc when the
 * peek parent *is* that Doc (classic Bill→Tax). Stale park must not steal Esc
 * from Payment Entry → Mode of Payment. A parent that is not loaded behind the peek (opened
 * from a Recent dropdown) is reopened in the clerk's lens.
 *
 * @param {{
 *   parked?: { route?: string, mode?: string }|null,
 *   peekStack?: PeekStack|null,
 *   currentRoute?: string,
 *   erpBase?: string,
 * }} [state]
 * @returns {{ action: "return-parent"|"reopen-parent"|"resume-park"|"disarm"|"none", route?: string }}
 */
export function resolveSoftPeekEscAction(state = {}) {
  const erpBase = state.erpBase;
  const here = state.currentRoute || "";
  const parked = state.parked;
  const stack = state.peekStack;

  if (isActivePeekStack(stack)) {
    const parent = stack.parent.route;
    const onParent = !!(parent && here && routesReferToSameDoc(parent, here, erpBase));
    const parkIsParent = !!(
      parked &&
      parked.route &&
      parent &&
      routesReferToSameDoc(parked.route, parent, erpBase)
    );

    if (!onParent) {
      // On a child master (Tax Category, Mode of Payment, …).
      if (parkIsParent) {
        // Classic Bill→Tax: Esc restores Doc Bill in one step.
        return { action: "resume-park", route: parked.route };
      }
      if (stack.parent.reopen) return { action: "reopen-parent", route: parent };
      // Payment Entry → Mode of Payment (stale Bill park must not win).
      return { action: "return-parent", route: parent };
    }
    // Already on peek parent.
    if (parkIsParent) {
      return { action: "resume-park", route: parked.route };
    }
    return { action: "disarm" };
  }

  if (parked && parked.route) {
    return { action: "resume-park", route: parked.route };
  }
  return { action: "none" };
}

/**
 * Who is the parent when the *shell* opens a peek (a Doc skin's peek button, a Recent setup row).
 * Inside a live session the peek is a sibling. A Doc skin on screen is the parent — its peek
 * buttons are peeks by definition, and it was parked a moment ago. On Vanilla, the form on screen
 * is the parent only if it has unsaved changes; a stale park never wins there.
 * @param {{
 *   stack?: PeekStack|null,
 *   currentRoute?: string,
 *   surfaceMode?: string,
 *   parkedRoute?: string,
 *   currentUnsaved?: boolean,
 *   erpBase?: string,
 * }} s
 * @returns {string} parent route, or "" for "not a peek"
 */
export function resolveSoftPeekParent(s = {}) {
  const erpBase = s.erpBase;
  const here = s.currentRoute || "";
  const stack = s.stack;
  if (isActivePeekStack(stack) && here) {
    const inSession =
      routesReferToSameDoc(stack.parent.route, here, erpBase) ||
      stack.children.some((c) => routesReferToSameDoc(c.route, here, erpBase));
    if (inSession) return stack.parent.route;
  }
  if (s.surfaceMode === "erp") {
    const rec = normalizeAppRoute(here, erpBase).record;
    return rec && s.currentUnsaved ? here : "";
  }
  return s.parkedRoute || "";
}

/**
 * One in-SPA Desk hop, as the page reported it (`erp-route-hop.js`). Plan 2026-09-26 N1:
 *
 * 1. A hop onto the parent or one of its children is a return — the stack stays as it is.
 * 2. Landing on a setup/master record makes a child when the form just left is a parent: the
 *    form Frappe names as the caller (`_from_link`, for a *new* record of the link's doctype,
 *    from that very form), or else a form left with unsaved changes. Any doctype.
 * 3. Inside a session, a hop from the parent or a child adds a sibling (depth stays one). A child
 *    left with unsaved changes becomes the new parent — unless a Doc skin is parked under the
 *    session (`anchorRoute`), which stays the anchor so Esc can always get back to it.
 * 4. Anywhere else that is not a setup page ends the session.
 *
 * @param {PeekStack|null|undefined} stack
 * @param {string} fromPath the form just left (from the page's own route history)
 * @param {string} toPath where the hop landed
 * @param {{
 *   erpBase?: string,
 *   history?: object[],
 *   prevUnsaved?: boolean,
 *   fromLinkParent?: string,
 *   fromLinkTarget?: string,
 *   anchorRoute?: string,
 * }} [opts]
 * @returns {PeekStack|null}
 */
export function applyErpHopToPeekStack(stack, fromPath, toPath, opts = {}) {
  const erpBase = opts.erpBase;
  const live = isActivePeekStack(stack);
  const keep = live ? stack : null;
  const from = fromPath ? normalizeAppRoute(fromPath, erpBase).path || "" : "";
  const to = toPath ? normalizeAppRoute(toPath, erpBase).path || "" : "";
  if (!to) return keep;
  if (from && routesReferToSameDoc(from, to, erpBase)) return keep;
  const isParent = (r) => live && !!r && routesReferToSameDoc(stack.parent.route, r, erpBase);
  const isChild = (r) =>
    live && !!r && stack.children.some((c) => routesReferToSameDoc(c.route, r, erpBase));

  if (isParent(to) || isChild(to)) return stack;

  if (isPeekChildRoute(to, erpBase)) {
    const fromIsForm = !!(from && normalizeAppRoute(from, erpBase).record);
    const toInfo = normalizeAppRoute(to, erpBase);
    const namedByFrappe = !!(
      fromIsForm &&
      opts.fromLinkParent &&
      routesReferToSameDoc(opts.fromLinkParent, from, erpBase) &&
      toInfo.isNew &&
      (!opts.fromLinkTarget || opts.fromLinkTarget === toInfo.doctype)
    );
    const leftWork = fromIsForm && (namedByFrappe || !!opts.prevUnsaved);
    const start = () => pushPeekChild(beginPeekParent(null, from, opts), to, opts);

    if (isParent(from)) return pushPeekChild(stack, to, opts);
    if (isChild(from)) {
      const anchored = !!(
        opts.anchorRoute && routesReferToSameDoc(opts.anchorRoute, stack.parent.route, erpBase)
      );
      return leftWork && !anchored ? start() : pushPeekChild(stack, to, opts);
    }
    if (leftWork) return start();
    return keep;
  }

  if (live && shouldCollapsePeekStack(stack, to, opts)) return null;
  return keep;
}
