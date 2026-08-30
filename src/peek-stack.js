/**
 * Nested peeks under a parent Doc (OI-128 approach A).
 * One ERP WebContents; flyout draws a tree. Collapse = clear this stack;
 * children stay in Recent as standalone rows (already pushed via history).
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
 * @typedef {{ route: string, label: string, dt: string, detail?: string }} PeekRef
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
      route: normalizeAppRoute(found.route, erpBase).path || path,
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
 * Start or keep a peek parent. A different parent starts a fresh child list.
 * @param {PeekStack|null|undefined} stack
 * @param {PeekRef|string} parent
 * @param {{ erpBase?: string, history?: object[] }} [opts]
 * @returns {PeekStack|null}
 */
export function beginPeekParent(stack, parent, opts = {}) {
  const ref =
    parent && typeof parent === "object" && parent.route
      ? peekRefFromRoute(parent.route, opts.history, opts.erpBase)
      : peekRefFromRoute(parent, opts.history, opts.erpBase);
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
  if (!isSoftPeekRoute(ref.route, opts.erpBase)) return stack;
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

/**
 * Pin live parent+children at the top of Recent; hide those routes from the flat tail
 * so Tax Category is not listed twice.
 * @param {object[]} history
 * @param {PeekStack|null|undefined} stack
 * @param {string} [erpBase]
 * @returns {object[]}
 */
export function applyPeekTreeToHistory(history, stack, erpBase) {
  const list = Array.isArray(history) ? history.filter((h) => h && h.route) : [];
  const clearTree = (h) => ({
    ...h,
    treeRole: null,
    treeDepth: 0,
    treeParentLabel: "",
  });
  if (!isActivePeekStack(stack)) return list.map(clearTree);

  const parentPath = normalizeAppRoute(stack.parent.route, erpBase).path;
  const parentFromHist = list.find((h) => routesReferToSameDoc(h.route, parentPath, erpBase));
  const parentEntry = decorateHistoryEntry(
    parentFromHist
      ? { ...parentFromHist }
      : {
          route: parentPath,
          dt: stack.parent.dt,
          label: stack.parent.label,
          detail: stack.parent.detail || "",
        },
    erpBase,
  );

  const childPaths = stack.children.map((c) => normalizeAppRoute(c.route, erpBase).path);
  const childEntries = stack.children.map((c) => {
    const path = normalizeAppRoute(c.route, erpBase).path;
    const fromHist = list.find((h) => routesReferToSameDoc(h.route, path, erpBase));
    const entry = decorateHistoryEntry(
      fromHist
        ? { ...fromHist }
        : {
            route: path,
            dt: c.dt,
            label: c.label,
            detail: c.detail || "setup",
            detailMuted: true,
          },
      erpBase,
    );
    return {
      ...entry,
      treeRole: "child",
      treeDepth: 1,
      treeParentLabel: parentEntry.label || "document",
    };
  });

  const taken = (h) =>
    routesReferToSameDoc(h.route, parentPath, erpBase) ||
    childPaths.some((p) => routesReferToSameDoc(h.route, p, erpBase));
  const rest = list.filter((h) => !taken(h)).map(clearTree);

  return [
    {
      ...parentEntry,
      treeRole: "parent",
      treeDepth: 0,
      treeParentLabel: "",
    },
    ...childEntries,
    ...rest,
  ];
}

/**
 * Esc while soft-peeking: child → parent first; only resume parked Doc when the
 * peek parent *is* that Doc (classic Bill→Tax). Stale park must not steal Esc
 * from Payment Entry → Mode of Payment.
 *
 * @param {{
 *   parked?: { route?: string, mode?: string }|null,
 *   peekStack?: PeekStack|null,
 *   currentRoute?: string,
 *   erpBase?: string,
 * }} [state]
 * @returns {{ action: "return-parent"|"resume-park"|"disarm"|"none", route?: string }}
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
 * In-SPA Desk hops: leaving a Bill/PO/IR form for a setup master starts the peek tree
 * even when we are already on Vanilla (no Doc park).
 * @param {PeekStack|null|undefined} stack
 * @param {string} fromPath
 * @param {string} toPath
 * @param {{ erpBase?: string, history?: object[] }} [opts]
 * @returns {PeekStack|null}
 */
export function applyErpHopToPeekStack(stack, fromPath, toPath, opts = {}) {
  const from = normalizeAppRoute(fromPath, opts.erpBase).path || "";
  const to = normalizeAppRoute(toPath, opts.erpBase).path || "";
  if (!to) return isActivePeekStack(stack) ? stack : null;
  if (from && routesReferToSameDoc(from, to, opts.erpBase)) {
    return isActivePeekStack(stack) ? stack : null;
  }

  if (isSoftPeekRoute(to, opts.erpBase)) {
    const fromClass = classifyHistoryOpen(from, opts.erpBase);
    if (fromClass.mode === "doc-preferred" && fromClass.record) {
      const next = beginPeekParent(stack, from, opts);
      return pushPeekChild(next, to, opts);
    }
    // Payment Entry → Mode of Payment: re-parent to the live Vanilla form so Esc
    // returns there. Sibling peeks under a Doc parent (Bill→Tax→Vendor) stay put —
    // except Payment Entry / JE / Payment Order, which are their own Esc sessions.
    if (
      fromClass.mode === "vanilla-always" &&
      fromClass.record &&
      isSoftPeekRoute(from, opts.erpBase)
    ) {
      const SESSION_PARENT_DT = new Set([
        "payment-entry",
        "journal-entry",
        "payment-order",
        "payment-reconciliation",
      ]);
      if (!isActivePeekStack(stack)) {
        const next = beginPeekParent(stack, from, opts);
        return pushPeekChild(next, to, opts);
      }
      if (routesReferToSameDoc(stack.parent.route, from, opts.erpBase)) {
        return pushPeekChild(stack, to, opts);
      }
      const parentClass = classifyHistoryOpen(stack.parent.route, opts.erpBase);
      if (parentClass.mode === "doc-preferred" && !SESSION_PARENT_DT.has(fromClass.doctype)) {
        return pushPeekChild(stack, to, opts);
      }
      const next = beginPeekParent(stack, from, opts);
      return pushPeekChild(next, to, opts);
    }
    if (isActivePeekStack(stack)) return pushPeekChild(stack, to, opts);
    return null;
  }

  if (shouldCollapsePeekStack(stack, to, opts)) return null;
  return isActivePeekStack(stack) ? stack : null;
}
