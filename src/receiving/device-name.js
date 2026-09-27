/**
 * The name a phone is given at setup (spec §7.1, plan P2d). Asked once and stored on the phone, so
 * the audit trail can tell one person's phone from a shared dock handheld later. Pure.
 *
 * It is a label for people, not an identifier for security: anyone holding the phone can change
 * it, and nothing may trust it for access. Who did something comes from the ERPNext login.
 */

export const DEVICE_NAME_MAX = 40;

/**
 * Tidy what was typed and say whether it will do. Returns `{ ok: true, name }` or
 * `{ ok: false, reason }` with a sentence the setup page can show as-is.
 */
export function normaliseDeviceName(input) {
  const name = String(input ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length === 0) {
    return { ok: false, reason: "Give this phone a name, like “Dock 1” or “Sam’s phone”." };
  }
  if (name.length > DEVICE_NAME_MAX) {
    return { ok: false, reason: `Keep the name to ${DEVICE_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, name };
}
