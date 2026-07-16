/**
 * Pure money helpers for the Doc Workflow shell.
 * No ERPNext imports — unit-testable offline (ADR-0002: unit tests first).
 */

/**
 * Round a dollar amount to the nearest nickel (5 cents).
 * Used later for OI-042 experiments; stub proves CI without a live server.
 * @param {number} amount
 * @returns {number}
 */
export function roundToNickel(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new TypeError("roundToNickel: amount must be a finite number");
  }
  return Math.round(amount * 20) / 20;
}
