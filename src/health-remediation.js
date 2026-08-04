/**
 * ERP-unreachable remediation prefs (diagnose panel).
 * SSoT for IT-chosen notify vs autofix — stored in userData only.
 *
 * Security: mode defaults to unset. No script path or notify URL is ever
 * shipped as a working default. Autofix runs only an absolute path the user
 * (IT) explicitly picked after setup.
 */

/** @typedef {"unset" | "notify" | "autofix"} RemediationMode */

/**
 * @typedef {{
 *   mode: RemediationMode,
 *   notifyUrl: string,
 *   autofixScriptPath: string,
 *   configuredAt: string,
 * }} HealthRemediationPrefs
 */

/**
 * @typedef {{
 *   showSetup: boolean,
 *   showNotify: boolean,
 *   showAutofix: boolean,
 *   showFinishAutofixSetup: boolean,
 *   setupLabel: string,
 *   notifyLabel: string,
 *   autofixLabel: string,
 *   finishAutofixLabel: string,
 *   hint: string,
 * }} RemediationUiState
 */

export const HEALTH_REMEDIATION_FILENAME = "health-remediation.json";

/** @type {HealthRemediationPrefs} */
export const EMPTY_HEALTH_REMEDIATION = Object.freeze({
  mode: "unset",
  notifyUrl: "",
  autofixScriptPath: "",
  configuredAt: "",
});

/**
 * @param {unknown} raw
 * @returns {HealthRemediationPrefs}
 */
export function normalizeHealthRemediationPrefs(raw) {
  const base = { ...EMPTY_HEALTH_REMEDIATION };
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const mode = o.mode === "notify" || o.mode === "autofix" || o.mode === "unset" ? o.mode : "unset";
  const notifyUrl = typeof o.notifyUrl === "string" ? o.notifyUrl.trim() : "";
  const autofixScriptPath =
    typeof o.autofixScriptPath === "string" ? o.autofixScriptPath.trim() : "";
  const configuredAt = typeof o.configuredAt === "string" ? o.configuredAt.trim() : "";
  return {
    mode,
    notifyUrl: isSafeNotifyUrl(notifyUrl) ? notifyUrl : "",
    autofixScriptPath: isAllowedAutofixScriptPath(autofixScriptPath) ? autofixScriptPath : "",
    configuredAt,
  };
}

/**
 * HTTPS only (Google Form, status page, ticket intake). Rejects file:, javascript:, etc.
 * @param {string|null|undefined} url
 */
export function isSafeNotifyUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!u.hostname) return false;
  return true;
}

/**
 * Absolute filesystem path only — never relative, never empty.
 * Does not check that the file exists (that is an Electron/fs concern).
 * @param {string|null|undefined} p
 */
export function isAllowedAutofixScriptPath(p) {
  if (typeof p !== "string" || !p.trim()) return false;
  const s = p.trim();
  if (s.includes("\0")) return false;
  // Unix absolute or Windows drive / UNC
  if (s.startsWith("/")) return !s.includes("://");
  if (/^[A-Za-z]:[\\/]/.test(s)) return true;
  if (s.startsWith("\\\\")) return true;
  return false;
}

/**
 * Whether autofix can offer "Start ERPNext" (path configured + valid shape).
 * @param {HealthRemediationPrefs} prefs
 */
export function autofixReady(prefs) {
  const p = normalizeHealthRemediationPrefs(prefs);
  return p.mode === "autofix" && isAllowedAutofixScriptPath(p.autofixScriptPath);
}

/**
 * @param {HealthRemediationPrefs|null|undefined} prefs
 * @param {{ status?: "ok"|"bad"|"unknown" }} [ctx]
 * @returns {RemediationUiState}
 */
export function remediationUiState(prefs, ctx = {}) {
  const p = normalizeHealthRemediationPrefs(prefs);
  const bad = ctx.status === "bad";
  /** @type {RemediationUiState} */
  const ui = {
    showSetup: false,
    showNotify: false,
    showAutofix: false,
    showFinishAutofixSetup: false,
    setupLabel: "Set up how IT wants to handle this…",
    notifyLabel: "Notify IT",
    autofixLabel: "Start ERPNext",
    finishAutofixLabel: "Finish autofix setup (choose script)…",
    hint: "",
  };

  if (!bad) {
    ui.hint =
      p.mode === "unset"
        ? "IT can set notify or autofix for when ERP is down (optional)."
        : p.mode === "notify"
          ? "When ERP is down: Notify IT opens your configured form."
          : autofixReady(p)
            ? "When ERP is down: Start ERPNext runs the IT-configured script."
            : "Autofix mode is on but no script path is saved yet.";
    ui.showSetup = true;
    ui.setupLabel = p.mode === "unset" ? ui.setupLabel : "Change IT recovery settings…";
    return ui;
  }

  if (p.mode === "unset") {
    ui.showSetup = true;
    ui.hint =
      "ERP is unreachable. Set up how IT wants to handle this (notify form or autofix script). Clones ship with no script — nothing runs until you configure it.";
    return ui;
  }

  if (p.mode === "notify") {
    ui.showSetup = true;
    if (isSafeNotifyUrl(p.notifyUrl)) {
      ui.showNotify = true;
      ui.setupLabel = "Change IT recovery settings…";
      ui.hint = "Opens the IT notify form (HTTPS). No local scripts are run.";
    } else {
      ui.setupLabel = "Finish notify setup (HTTPS form URL)…";
      ui.hint = "Notify mode is on but no valid HTTPS form URL is saved.";
    }
    return ui;
  }

  // autofix
  ui.showSetup = true;
  ui.setupLabel = "Change IT recovery settings…";
  if (autofixReady(p)) {
    ui.showAutofix = true;
    ui.hint =
      "Runs only the script path IT saved on this PC (absolute path). Confirm before each run.";
  } else {
    ui.showFinishAutofixSetup = true;
    ui.hint =
      "Autofix mode is on but no script is configured. Choose an absolute path — the app never ships a default script.";
  }
  return ui;
}

/**
 * Apply setup wizard answers → new prefs (pure).
 * @param {HealthRemediationPrefs|null|undefined} prev
 * @param {{
 *   mode: RemediationMode,
 *   notifyUrl?: string,
 *   autofixScriptPath?: string,
 *   nowIso?: string,
 * }} choice
 * @returns {{ ok: boolean, prefs: HealthRemediationPrefs, reason?: string }}
 */
export function applyRemediationSetup(prev, choice) {
  const nowIso = choice.nowIso || new Date().toISOString();
  if (!choice || (choice.mode !== "notify" && choice.mode !== "autofix" && choice.mode !== "unset")) {
    return { ok: false, prefs: normalizeHealthRemediationPrefs(prev), reason: "Pick notify, autofix, or clear." };
  }
  if (choice.mode === "unset") {
    return { ok: true, prefs: { ...EMPTY_HEALTH_REMEDIATION } };
  }
  if (choice.mode === "notify") {
    const url = String(choice.notifyUrl || "").trim();
    if (!isSafeNotifyUrl(url)) {
      return {
        ok: false,
        prefs: normalizeHealthRemediationPrefs(prev),
        reason: "Notify needs an https:// form URL (e.g. Google Form).",
      };
    }
    return {
      ok: true,
      prefs: {
        mode: "notify",
        notifyUrl: url,
        autofixScriptPath: "",
        configuredAt: nowIso,
      },
    };
  }
  const script = String(choice.autofixScriptPath || "").trim();
  if (!isAllowedAutofixScriptPath(script)) {
    return {
      ok: false,
      prefs: normalizeHealthRemediationPrefs(prev),
      reason: "Autofix needs an absolute script path chosen on this PC (not a relative or empty path).",
    };
  }
  return {
    ok: true,
    prefs: {
      mode: "autofix",
      notifyUrl: "",
      autofixScriptPath: script,
      configuredAt: nowIso,
    },
  };
}
