/**
 * Feedback form URL builder (OI-048) — no cookies/sid.
 */

/** Replace via FEEDBACK_FORM_URL when a real Google Form exists. */
export const DEFAULT_FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdPLACEHOLDER_SET_FEEDBACK_FORM_URL/viewform";

/**
 * @param {NodeJS.ProcessEnv|Record<string,string|undefined>} [env]
 * @returns {string}
 */
export function resolveFeedbackFormUrl(env = process.env) {
  const raw = (env && env.FEEDBACK_FORM_URL) || DEFAULT_FEEDBACK_FORM_URL;
  return String(raw).trim();
}

/**
 * @param {string} baseUrl
 * @param {{ version?: string, hostClass?: string }} [ctx]
 * @returns {string}
 */
export function buildFeedbackUrl(baseUrl, ctx = {}) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new TypeError("buildFeedbackUrl: baseUrl required");
  }
  let u;
  try {
    u = new URL(baseUrl.trim());
  } catch {
    throw new TypeError("buildFeedbackUrl: invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new TypeError("buildFeedbackUrl: only http(s)");
  }
  // Never forward secrets even if a caller slips them in.
  const forbidden = ["sid", "cookie", "password", "token", "api_key", "api_secret"];
  for (const key of [...u.searchParams.keys()]) {
    if (forbidden.includes(key.toLowerCase())) u.searchParams.delete(key);
  }
  if (ctx.version) u.searchParams.set("entry.version", String(ctx.version));
  if (ctx.hostClass) u.searchParams.set("entry.host", String(ctx.hostClass));
  return u.toString();
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isPlaceholderFeedbackUrl(url) {
  return typeof url === "string" && /PLACEHOLDER/i.test(url);
}
