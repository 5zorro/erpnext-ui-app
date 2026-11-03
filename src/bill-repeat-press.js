/**
 * A second press while the first is still working (end-of-session review 2026-10-31, S1). Assign's
 * Apply and Allocate's Apply write to the Bill, and a second press while the first call is out
 * used to run it again: Allocate put the charge into the item costs twice, Assign could make a
 * second bridge Purchase Order. Never silently: 5zorro, "I don't want something silently
 * ignored" — the repeat is held back and a toast says so, with a click to run it again anyway.
 * The toast goes when the first call ends, so the click can only mean "both, at once".
 */

/** The toast's words for a press held back. */
export const repeatPressToast = (action) =>
  `Still working on "${action}" — your second press was held back. Click here to run it again anyway.`;

/**
 * @param {{ onRepeat: (runAgain: () => Promise<unknown>) => void, onIdle?: () => void }} hooks
 *   `onRepeat` — a press came while a run is out: say so, `runAgain` is the clerk's override;
 *   `onIdle` — no run is out any more
 */
export function createRepeatPressGuard(hooks) {
  let running = 0;
  async function run(fn) {
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
      if (!running && hooks.onIdle) hooks.onIdle();
    }
  }
  return {
    /** True while a run is out. */
    busy: () => running > 0,
    /**
     * Run `fn`, or, while a run is out, hold it back and offer the override.
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T|undefined>}
     */
    press(fn) {
      if (running > 0) {
        hooks.onRepeat(() => run(fn));
        return Promise.resolve(undefined);
      }
      return run(fn);
    },
  };
}
