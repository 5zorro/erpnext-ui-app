/**
 * Bill Ref No. (`bill_no`) soft sanity checks — OI-054 (dupe) + OI-087 sandwich/pattern (non-blocking).
 *
 * Identities compared against Supplier Invoice No.:
 * - other Bills' `bill_no` (duplicate entry)
 * - linked PO logbook # (`Purchase Order.title`) — wrong-field paste
 * - vendor account # at supplier (`Customer Number At Supplier.customer_number`) —
 *   what the vendor calls *your* account (often printed on checks); not a Sales Order customer
 * - last-6 vendor refs pattern (length + letter/digit class; drop one outlier)
 */

/**
 * @typedef {{
 *   name: string,
 *   bill_no?: string,
 *   supplier?: string,
 *   posting_date?: string,
 *   grand_total?: number|string|null,
 *   docstatus?: number|string,
 * }} ExistingBillHit
 *
 * @typedef {{
 *   code: "duplicate"|"logbook_po"|"vendor_account"|"erp_po_name"|"pattern",
 *   severity: "soft"|"high",
 *   emoji: string,
 *   message: string,
 *   detail?: string,
 * }} BillRefWarning
 *
 * @typedef {{
 *   status: "idle"|"ok"|"warn",
 *   emoji: string,
 *   title: string,
 *   warnings: BillRefWarning[],
 * }} BillRefCheckResult
 *
 * @typedef {{
 *   ok: boolean,
 *   reasons: string[],
 *   kept: string[],
 *   droppedOutlier: string|null,
 *   expectedLength: number|null,
 *   expectedClasses: string|null,
 * }} PatternCompareResult
 */

export const BILL_REF_PATTERN_WINDOW = 6;

/** Normalize for equality (trim, collapse space, case-insensitive). */
export function normalizeBillRef(raw) {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Exact match after normalize (empty never matches).
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 */
export function billRefsEqual(a, b) {
  const na = normalizeBillRef(a);
  const nb = normalizeBillRef(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Character class for pattern fingerprint: L letter, D digit, P other.
 * @param {string} ch
 * @returns {"L"|"D"|"P"}
 */
export function billRefCharClass(ch) {
  if (/[A-Za-z]/.test(ch)) return "L";
  if (/[0-9]/.test(ch)) return "D";
  return "P";
}

/**
 * @param {string} ref
 * @returns {string}
 */
export function billRefClassSignature(ref) {
  return [...String(ref)].map(billRefCharClass).join("");
}

/**
 * Distance between two class signatures (pad shorter with ·).
 * Letter↔digit mismatches cost more than punctuation drift.
 * @param {string} a
 * @param {string} b
 */
export function billRefSignatureDistance(a, b) {
  const n = Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const ca = a[i] || "·";
    const cb = b[i] || "·";
    if (ca === cb) continue;
    if ((ca === "L" && cb === "D") || (ca === "D" && cb === "L")) d += 3;
    else d += 1;
  }
  return d + Math.abs(a.length - b.length);
}

/**
 * Drop the single largest outlier among recent refs, then compare typed to majority pattern.
 * @param {string} typed
 * @param {string[]} recentRefs last N vendor bill_no values (newest first ok)
 * @returns {PatternCompareResult}
 */
export function compareBillRefToRecentPattern(typed, recentRefs) {
  const ref = typed != null ? String(typed).trim() : "";
  const priors = (Array.isArray(recentRefs) ? recentRefs : [])
    .map((s) => String(s == null ? "" : s).trim())
    .filter(Boolean)
    .slice(0, BILL_REF_PATTERN_WINDOW);

  if (!ref || priors.length < 3) {
    return {
      ok: true,
      reasons: [],
      kept: priors,
      droppedOutlier: null,
      expectedLength: null,
      expectedClasses: null,
    };
  }

  const sigs = priors.map((p) => billRefClassSignature(p));
  // Mean pairwise distance → drop the one most unlike the others (FIN CHRGE among SO-…).
  let dropIdx = 0;
  let dropScore = -1;
  for (let i = 0; i < priors.length; i++) {
    let score = 0;
    for (let j = 0; j < priors.length; j++) {
      if (i === j) continue;
      score += billRefSignatureDistance(sigs[i], sigs[j]);
      score += Math.abs(priors[i].length - priors[j].length);
    }
    if (score > dropScore) {
      dropScore = score;
      dropIdx = i;
    }
  }

  const droppedOutlier = priors[dropIdx];
  const kept = priors.filter((_, i) => i !== dropIdx);
  const keptSigs = kept.map((p) => billRefClassSignature(p));

  /** @type {Map<number, number>} */
  const lenVotes = new Map();
  for (const p of kept) {
    lenVotes.set(p.length, (lenVotes.get(p.length) || 0) + 1);
  }
  let expectedLength = kept[0].length;
  let bestLenVotes = 0;
  for (const [len, votes] of lenVotes) {
    if (votes > bestLenVotes) {
      bestLenVotes = votes;
      expectedLength = len;
    }
  }

  const sameLen = kept.filter((p) => p.length === expectedLength);
  const sameLenSigs = sameLen.map((p) => billRefClassSignature(p));
  let expectedClasses = "";
  for (let i = 0; i < expectedLength; i++) {
    /** @type {Map<string, number>} */
    const votes = new Map();
    for (const sig of sameLenSigs) {
      const c = sig[i] || "P";
      votes.set(c, (votes.get(c) || 0) + 1);
    }
    let best = "P";
    let bv = -1;
    for (const [c, v] of votes) {
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    expectedClasses += best;
  }

  /** @type {string[]} */
  const reasons = [];
  if (ref.length !== expectedLength) {
    reasons.push(`length ${ref.length} vs usual ${expectedLength} for this vendor`);
  }

  const typedSig = billRefClassSignature(ref);
  const cmpLen = Math.min(typedSig.length, expectedClasses.length);
  /** @type {number[]} */
  const letterDigitMismatches = [];
  for (let i = 0; i < cmpLen; i++) {
    const a = typedSig[i];
    const b = expectedClasses[i];
    if ((a === "L" && b === "D") || (a === "D" && b === "L")) {
      letterDigitMismatches.push(i + 1);
    }
  }
  if (letterDigitMismatches.length) {
    reasons.push(
      `letter/digit mismatch at position(s) ${letterDigitMismatches.join(", ")} (e.g. O vs 0)`,
    );
  }

  if (!reasons.length && ref.length === expectedLength) {
    const dist = billRefSignatureDistance(typedSig, expectedClasses);
    if (dist >= 3) {
      reasons.push("shape differs from this vendor’s usual invoice # pattern");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    kept,
    droppedOutlier,
    expectedLength,
    expectedClasses,
  };
}

/**
 * @param {string|null|undefined} billNo
 * @param {{
 *   currentBillName?: string|null,
 *   supplier?: string|null,
 *   existingBills?: ExistingBillHit[],
 *   recentVendorRefs?: string[],
 *   linkedPoTitles?: string[],
 *   linkedPoNames?: string[],
 *   vendorAccountNumbers?: string[],
 * }} ctx
 * @returns {BillRefCheckResult}
 */
export function evaluateBillRef(billNo, ctx = {}) {
  const ref = billNo != null ? String(billNo).trim() : "";
  if (!ref) {
    return {
      status: "idle",
      emoji: "·",
      title: "Type the supplier invoice number to run soft Ref checks",
      warnings: [],
    };
  }

  /** @type {BillRefWarning[]} */
  const warnings = [];
  const currentName = ctx.currentBillName != null ? String(ctx.currentBillName).trim() : "";
  const existing = Array.isArray(ctx.existingBills) ? ctx.existingBills : [];

  const dupes = existing.filter((row) => {
    if (!row) return false;
    const name = row.name != null ? String(row.name).trim() : "";
    if (currentName && name && name === currentName) return false;
    return billRefsEqual(row.bill_no, ref);
  });

  if (dupes.length) {
    const sameVendor = dupes.filter(
      (d) =>
        ctx.supplier &&
        d.supplier &&
        String(d.supplier).trim() === String(ctx.supplier).trim(),
    );
    const hits = sameVendor.length ? sameVendor : dupes;
    const high = sameVendor.length > 0;
    const sample = hits
      .slice(0, 3)
      .map((d) => {
        const bits = [d.name];
        if (d.posting_date) bits.push(String(d.posting_date));
        if (d.grand_total != null && d.grand_total !== "") bits.push(`$${d.grand_total}`);
        return bits.join(" · ");
      })
      .join("; ");
    warnings.push({
      code: "duplicate",
      severity: high ? "high" : "soft",
      emoji: high ? "⚠" : "◐",
      message: high
        ? `Possible duplicate — same Ref on ${hits.length} Bill(s) for this vendor`
        : `Possible duplicate — same Ref on ${hits.length} other Bill(s)`,
      detail: sample || undefined,
    });
  }

  const titles = Array.isArray(ctx.linkedPoTitles) ? ctx.linkedPoTitles : [];
  for (const t of titles) {
    if (!billRefsEqual(ref, t)) continue;
    warnings.push({
      code: "logbook_po",
      severity: "soft",
      emoji: "📋",
      message: "Looks like a PO logbook # (Title), not the supplier invoice number",
      detail: String(t).trim(),
    });
    break;
  }

  const poNames = Array.isArray(ctx.linkedPoNames) ? ctx.linkedPoNames : [];
  for (const n of poNames) {
    if (!billRefsEqual(ref, n)) continue;
    warnings.push({
      code: "erp_po_name",
      severity: "soft",
      emoji: "📎",
      message: "Looks like an ERP Purchase Order id, not the supplier invoice number",
      detail: String(n).trim(),
    });
    break;
  }

  const accounts = Array.isArray(ctx.vendorAccountNumbers) ? ctx.vendorAccountNumbers : [];
  for (const acct of accounts) {
    if (!billRefsEqual(ref, acct)) continue;
    warnings.push({
      code: "vendor_account",
      severity: "soft",
      emoji: "🏦",
      message:
        "Looks like your account # at this vendor (Customer Number / account), not an invoice #",
      detail: String(acct).trim(),
    });
    break;
  }

  const recent = Array.isArray(ctx.recentVendorRefs) ? ctx.recentVendorRefs : [];
  const pattern = compareBillRefToRecentPattern(ref, recent);
  if (!pattern.ok) {
    const examples = recent.slice(0, BILL_REF_PATTERN_WINDOW).join(", ");
    const droppedNote = pattern.droppedOutlier
      ? ` (ignored outlier ${pattern.droppedOutlier})`
      : "";
    warnings.push({
      code: "pattern",
      severity: "soft",
      emoji: "≠",
      message: `Not like the others — ${pattern.reasons.join("; ")}${droppedNote}`,
      detail: examples ? `Last ${Math.min(recent.length, BILL_REF_PATTERN_WINDOW)}: ${examples}` : undefined,
    });
  }

  if (!warnings.length) {
    return {
      status: "ok",
      emoji: "✓",
      title: "Ref No. looks consistent (no dupe / wrong-field / pattern flags)",
      warnings: [],
    };
  }

  const title = warnings.map((w) => w.message + (w.detail ? ` (${w.detail})` : "")).join("\n");
  const primary = warnings.find((w) => w.severity === "high") || warnings[0];
  return {
    status: "warn",
    emoji: primary.emoji,
    title,
    warnings,
  };
}

/**
 * Collect sandwich identity strings from snapshot-side data (no ERP I/O).
 * @param {{
 *   linkedPos?: Array<{ name?: string, title?: string|null }>,
 *   vendorAccountNumbers?: string[],
 * }} raw
 */
export function billRefContextFromSnapshot(raw = {}) {
  const linked = Array.isArray(raw.linkedPos) ? raw.linkedPos : [];
  return {
    linkedPoNames: linked.map((r) => (r && r.name != null ? String(r.name) : "")).filter(Boolean),
    linkedPoTitles: linked
      .map((r) => (r && r.title != null ? String(r.title).trim() : ""))
      .filter(Boolean),
    vendorAccountNumbers: Array.isArray(raw.vendorAccountNumbers)
      ? raw.vendorAccountNumbers.map((s) => String(s).trim()).filter(Boolean)
      : [],
  };
}
