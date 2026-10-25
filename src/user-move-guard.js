/**
 * Did the clerk move on while the shell was waiting? (5zorro focus incident 2026-10-11: pick an Item
 * on line 2, the app moves to Description, the clerk Tabs to Qty — and 150 ms later the pick's own
 * "go to Description" lands, ~0.9 s after the pick, once ERPNext had filled the line.) Any focus move
 * the shell makes after waiting on ERPNext asks this first, and stays put if the clerk has moved.
 * Pure: the page counts the clerk's keys and clicks; this decides.
 */

/** Keys that are the clerk choosing where to be (not typing in a field). */
export function isUserMoveKey(key) {
  const k = String(key || "");
  return k === "Tab" || k === "Enter" || k === "Escape" || k.startsWith("Arrow");
}

export function createUserMoveGuard() {
  let seq = 0;
  return {
    /** The clerk moved (a navigation key, a click). */
    bump() {
      seq += 1;
    },
    /** Take before waiting. */
    mark() {
      return seq;
    },
    /** After waiting: has the clerk moved since `mark`? */
    movedSince(mark) {
      return seq !== mark;
    },
  };
}
