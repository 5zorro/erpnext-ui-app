/**
 * Back-into unit cost from line Amount (Packet C / clerk footing).
 * Amount stays display-only in ERP; Doc skin derives rate = amount / qty.
 */
import { parseMoney } from "../money.js";
import { formatCalcResult } from "./calc-engine.js";

/**
 * @param {unknown} amount desired line extended amount
 * @param {unknown} qty line quantity
 * @returns {{ ok: true, rate: number, rateText: string } | { ok: false, reason: string }}
 */
export function rateFromBackedInAmount(amount, qty) {
  const a = parseMoney(amount);
  const q = parseMoney(qty);
  if (a == null) {
    return { ok: false, reason: "Enter an amount to back into unit cost." };
  }
  if (q == null) {
    return { ok: false, reason: "Quantity is missing — set Qty before backing into cost." };
  }
  if (q === 0) {
    return { ok: false, reason: "Quantity is 0 — set Qty before backing into cost." };
  }
  const rate = a / q;
  if (!Number.isFinite(rate)) {
    return { ok: false, reason: "Could not compute unit cost from amount ÷ qty." };
  }
  return { ok: true, rate, rateText: formatCalcResult(rate) };
}
