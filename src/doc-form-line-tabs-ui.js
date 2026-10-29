/**
 * The Items / Expenses tabs over the lines table. Written once for every Doc form page (plan
 * 2026-10-25, R6a-1 step 1); a page without the tabs has none of these elements and nothing happens.
 */

/**
 * @typedef {{ tabItems?: HTMLElement|null, tabExpenses?: HTMLElement|null, panelItems?: HTMLElement|null, panelExpenses?: HTMLElement|null }} LineTabEls
 */

/**
 * @param {LineTabEls} el
 * @param {"items"|"expenses"} which
 */
export function setLineTab(el, which) {
  const expenses = which === "expenses";
  if (el.tabItems) {
    el.tabItems.classList.toggle("active", !expenses);
    el.tabItems.setAttribute("aria-selected", expenses ? "false" : "true");
  }
  if (el.tabExpenses) {
    el.tabExpenses.classList.toggle("active", expenses);
    el.tabExpenses.setAttribute("aria-selected", expenses ? "true" : "false");
  }
  if (el.panelItems) el.panelItems.hidden = expenses;
  if (el.panelExpenses) el.panelExpenses.hidden = !expenses;
}

/** @param {LineTabEls} el */
export function wireLineTabs(el) {
  if (el.tabItems) el.tabItems.onclick = () => setLineTab(el, "items");
  if (el.tabExpenses) el.tabExpenses.onclick = () => setLineTab(el, "expenses");
}
