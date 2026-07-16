/** Default shell config (no secrets). Override via env ERP_URL when launching. */
export const DEFAULT_ERP_BASE = "http://localhost:8080";
export const HEALTH_PING_PATH = "/api/method/ping";
export const HEALTH_PING_MS = 5000;
export const TAB_BAR_HEIGHT = 46;

export function resolveErpBase(env = process.env) {
  const raw = (env && env.ERP_URL) || DEFAULT_ERP_BASE;
  return String(raw).replace(/\/+$/, "");
}
