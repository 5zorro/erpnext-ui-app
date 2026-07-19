/**
 * Link picker keyboard / highlight policy (Bill Vendor/Terms/Item/Project).
 * Pure — no DOM. bill.html must call these so Tab/Enter behavior stays tested.
 */

/**
 * After search results render: always highlight first row so Tab/Enter work without ↑↓.
 * @param {number} optionCount
 * @returns {number} highlight index (-1 if none)
 */
export function initialLinkHighlightIndex(optionCount) {
  const n = Number(optionCount) || 0;
  return n > 0 ? 0 : -1;
}

/**
 * @param {number} hi current highlight (-1 = none)
 * @param {number} optionCount
 * @param {"up"|"down"} dir
 * @returns {number}
 */
export function nextLinkHighlightIndex(hi, optionCount, dir) {
  const n = Number(optionCount) || 0;
  if (n <= 0) return -1;
  if (dir === "down") {
    if (hi < 0) return 0;
    return Math.min(hi + 1, n - 1);
  }
  if (dir === "up") {
    if (hi <= 0) return 0;
    return hi - 1;
  }
  return hi;
}

/**
 * Resolve which option index to commit on Tab/Enter.
 * @param {number} hi
 * @param {number} optionCount
 * @returns {number} index or -1
 */
export function resolveLinkPickIndex(hi, optionCount) {
  const n = Number(optionCount) || 0;
  if (n <= 0) return -1;
  if (hi >= 0 && hi < n) return hi;
  return 0;
}

/**
 * @param {string} key
 * @param {{ dropdownOpen: boolean, optionCount: number }} state
 * @returns {"pick"|"close"|"search"|"move_down"|"move_up"|"none"}
 */
export function linkPickerKeyAction(key, state) {
  const open = !!(state && state.dropdownOpen);
  const n = Number(state && state.optionCount) || 0;
  if (key === "Escape") return open ? "close" : "none";
  if (key === "ArrowDown") {
    if (!open || n === 0) return "search";
    return "move_down";
  }
  if (key === "ArrowUp") {
    if (!open || n === 0) return "none";
    return "move_up";
  }
  if (key === "Tab" || key === "Enter") {
    if (!open || n === 0) return "none";
    return "pick";
  }
  return "none";
}

/**
 * After a Link pick on a line field, which field should receive focus?
 * Item → Description (paint rebuilds the row; without this, focus jumps to table start).
 * @param {string} field
 * @returns {string|null}
 */
export function nextFieldAfterLinkPick(field) {
  if (field === "item_code") return "description";
  return null;
}
