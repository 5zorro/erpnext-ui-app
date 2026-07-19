/**
 * Pure chrome UI state — toolbar / lens / home / health.
 * Electron (or tests) dispatch actions; no DOM here.
 */

/** @typedef {"vanilla"|"simplified"|"doc"} LensId */
/** @typedef {"ok"|"bad"|"unknown"} HealthStatus */

/**
 * @returns {{ lens: LensId, showingHome: boolean, health: HealthStatus }}
 */
export function initialChromeState() {
  return {
    lens: "doc",
    showingHome: true,
    health: "unknown",
  };
}

/**
 * @param {ReturnType<typeof initialChromeState>} state
 * @param {{ type: string, lens?: LensId, health?: HealthStatus }} action
 */
export function reduceChrome(state, action) {
  if (!state || !action || typeof action.type !== "string") return state;
  switch (action.type) {
    case "set-lens":
      if (action.lens !== "vanilla" && action.lens !== "simplified" && action.lens !== "doc") {
        return state;
      }
      return { ...state, lens: action.lens };
    case "go-home":
      return { ...state, showingHome: true, lens: "doc" };
    case "leave-home":
      return { ...state, showingHome: false };
    case "set-health":
      if (!["ok", "bad", "unknown"].includes(action.health)) return state;
      return { ...state, health: action.health };
    default:
      return state;
  }
}
