/**
 * Bill source modal — one ERP list per slice (streamed to UI as each IPC returns).
 * SSoT for slice ids, loading placeholders, and group assembly.
 */

import { sourceItemFromRow } from "./source-modal.js";

/** @typedef {"po_submitted"|"pr_submitted"|"po_draft"|"pr_draft"|"mr_submitted"|"sq_submitted"|"so_submitted"} SourceListSliceId */

/** @typedef {{ id: SourceListSliceId, baseName: string, kind: "po"|"pr"|"mr"|"sq"|"so", draft: boolean }} SourceListSliceDef */

/** @type {SourceListSliceDef[]} */
export const SOURCE_LIST_SLICE_DEFS = [
  {
    id: "po_submitted",
    baseName: "Purchase Orders — submitted",
    kind: "po",
    draft: false,
  },
  {
    id: "pr_submitted",
    baseName: "Item Receipts — submitted",
    kind: "pr",
    draft: false,
  },
  {
    id: "po_draft",
    baseName: "Purchase Orders — draft",
    kind: "po",
    draft: true,
  },
  {
    id: "pr_draft",
    baseName: "Item Receipts — draft",
    kind: "pr",
    draft: true,
  },
  // The Purchase Order's sources (plan 2026-10-12 S3): what ERPNext can map a PO from.
  {
    id: "mr_submitted",
    baseName: "Material Requests — still to order",
    kind: "mr",
    draft: false,
  },
  {
    id: "sq_submitted",
    baseName: "Supplier Quotations — this vendor",
    kind: "sq",
    draft: false,
  },
  {
    id: "so_submitted",
    baseName: "Sales Orders — still to order",
    kind: "so",
    draft: false,
  },
];

/** The Bill's slices — the default, and what the Bill's non-streamed list uses. @type {SourceListSliceId[]} */
export const SOURCE_LIST_SLICE_ORDER = ["po_submitted", "pr_submitted", "po_draft", "pr_draft"];

/**
 * Which slices each Doc skin's source picker lists. The Item Receipt is made from a PO only (its
 * merge refuses anything else, so listing Item Receipts there offered picks that failed); the PO
 * from a Material Request, a Supplier Quotation or a Sales Order (5zorro 2026-10-12: "NIC, MatReq,
 * SQ and SO").
 * @type {Record<string, SourceListSliceId[]>}
 */
export const SOURCE_SLICES_BY_SKIN = Object.freeze({
  bill: SOURCE_LIST_SLICE_ORDER,
  receipt: ["po_submitted", "po_draft"],
  po: ["mr_submitted", "sq_submitted", "so_submitted"],
});

/**
 * @param {string|null|undefined} skinId
 * @returns {SourceListSliceId[]}
 */
export function sourceSlicesForSkin(skinId) {
  return SOURCE_SLICES_BY_SKIN[String(skinId || "")] || SOURCE_LIST_SLICE_ORDER;
}

/** What the NIC row says on each skin ("enter this … manually"). */
const NIC_NOUN = Object.freeze({ bill: "Bill", receipt: "Item Receipt", po: "Purchase Order" });

/**
 * @param {SourceListSliceId} sliceId
 * @returns {SourceListSliceDef|null}
 */
export function sourceListSliceDef(sliceId) {
  return SOURCE_LIST_SLICE_DEFS.find((d) => d.id === sliceId) || null;
}

/**
 * NIC + loading placeholders (one per slice id).
 * @returns {import("./source-modal.js").SourceGroup[]}
 */
export function buildBillSourceLoadingGroups(skinId = "bill") {
  const noun = NIC_NOUN[String(skinId || "")] || "Bill";
  /** @type {import("./source-modal.js").SourceGroup[]} */
  const groups = [
    {
      id: "nic",
      name: "Not in computer (NIC)",
      items: [{ label: `NIC — enter this ${noun} manually (no source)`, kind: "nic" }],
    },
  ];
  for (const id of sourceSlicesForSkin(skinId)) {
    groups.push(loadingGroupForSlice(id));
  }
  return groups;
}

/**
 * @param {SourceListSliceId} sliceId
 * @returns {import("./source-modal.js").SourceGroup}
 */
export function loadingGroupForSlice(sliceId) {
  const def = sourceListSliceDef(sliceId);
  const name = def ? def.baseName : String(sliceId);
  return {
    id: sliceId,
    name,
    loading: true,
    items: [
      {
        label: "Still loading…",
        kind: def ? def.kind : "po",
        draft: true,
        loading: true,
      },
    ],
  };
}

/**
 * @param {SourceListSliceId} sliceId
 * @param {object[]} rows
 * @returns {import("./source-modal.js").SourceGroup|null}
 */
export function buildSourceGroupFromSliceRows(sliceId, rows) {
  const def = sourceListSliceDef(sliceId);
  if (!def) return null;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return {
      id: sliceId,
      name: def.draft ? `${def.baseName} (not selectable)` : `${def.baseName} (0)`,
      loading: false,
      items: [
        {
          label: def.draft ? "No draft rows" : "No open rows",
          kind: def.kind,
          draft: true,
        },
      ],
    };
  }
  const label = def.draft
    ? `${def.baseName} (not selectable)`
    : `${def.baseName} (${list.length})`;
  return {
    id: sliceId,
    name: label,
    loading: false,
    items: list.map((row) => sourceItemFromRow(row, def.kind, def.draft)),
  };
}

/**
 * Replace one slice slot; omit empty submitted groups (keep NIC + drafts grey).
 * @param {import("./source-modal.js").SourceGroup[]} groups
 * @param {import("./source-modal.js").SourceGroup} sliceGroup
 * @returns {import("./source-modal.js").SourceGroup[]}
 */
export function applySourceSliceToGroups(groups, sliceGroup) {
  const base = Array.isArray(groups) ? [...groups] : buildBillSourceLoadingGroups();
  const id = sliceGroup && sliceGroup.id;
  if (!id) return base;

  const def = sourceListSliceDef(/** @type {SourceListSliceId} */ (id));
  const selectable =
    sliceGroup.items &&
    sliceGroup.items.some((it) => it && !it.draft && !it.loading && it.kind !== "nic");

  if (def && !def.draft && !selectable) {
    return base.filter((g) => g.id !== id);
  }

  const idx = base.findIndex((g) => g.id === id);
  if (idx >= 0) {
    base[idx] = sliceGroup;
    return base;
  }
  const nicIdx = base.findIndex((g) => g.id === "nic");
  if (nicIdx >= 0) {
    base.splice(nicIdx + 1, 0, sliceGroup);
    return base;
  }
  base.push(sliceGroup);
  return base;
}
