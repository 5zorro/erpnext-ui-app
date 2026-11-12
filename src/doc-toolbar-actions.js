/**
 * Find, New and Print from a Doc form's toolbar (or after its commit gate let the clerk go),
 * written once for every Doc form page (plan 2026-10-25 closeout, item 4). What each form says and
 * which list it opens come from the page; the steps are the same: Find opens the form's list in
 * ERPNext and puts the cursor back in its filter (the shell's window can take the OS focus), New
 * starts a blank one, Print opens the print dialog in place.
 */

import { openPrintDialog } from "./print-dialog-ui.js";

/**
 * @typedef {{
 *   api: any,
 *   lastDoc: any,
 *   title: string,
 *   setStatus: (text: string, cls?: string) => void,
 *   find: () => { opening: string, open: () => Promise<any>, focusField: string, opened: (res: any) => string },
 *   newDoc: () => Promise<any>,
 *   afterNew?: () => void,
 * }} ToolbarActionDeps
 *
 * `find().opened(res)`: the status once the list is open with its filter focused.
 */

/**
 * @param {"find"|"new"|"print"|string} action
 * @param {ToolbarActionDeps} deps
 */
export async function runDocToolbarAction(action, deps) {
  const { api, setStatus, title } = deps;
  if (!api) return;
  if (action === "find") {
    const find = deps.find();
    setStatus(find.opening);
    const res = await find.open();
    try {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    } catch {
      /* ignore */
    }
    // Re-assert the filter's focus after Find (the shell's window can take the OS focus).
    let post = null;
    if (res && res.ok && api.refocusListFilter) {
      try {
        post = await api.refocusListFilter(res.focusField || find.focusField);
      } catch {
        /* ignore */
      }
    }
    if (!(res && res.ok)) setStatus((res && res.reason) || "Find failed.", "err");
    else if (res.focusOk === false || (post && post.ok === false)) {
      setStatus(res.reason || post?.reason || `${title} list opened (filter focus missed).`, "warn");
    } else setStatus(find.opened(res));
    return;
  }
  if (action === "new") {
    setStatus(`Starting new ${title}…`);
    const res = await deps.newDoc();
    if (res && res.ok) {
      setStatus(`New ${title}.`);
      if (deps.afterNew) deps.afterNew();
    } else setStatus((res && res.reason) || `New ${title} failed.`, "err");
    return;
  }
  if (action === "print") {
    // In place: the dialog prints / saves ERPNext's own output; the form never moves.
    await openPrintDialog({ api, doc: deps.lastDoc, label: title });
  }
}
