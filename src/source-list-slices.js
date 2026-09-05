/**
 * Bill source modal — one ERP list per slice (streamed to UI as each IPC returns).
 * SSoT for slice ids, loading placeholders, and group assembly.
 */

import { sourceItemFromRow } from "./source-modal.js";

/** @typedef {"po_submitted"|"pr_submitted"|"po_draft"|"pr_draft"} SourceListSliceId */

/** @typedef {{ id: SourceListSliceId, baseName: string, kind: "po"|"pr", draft: boolean }} SourceListSliceDef */

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
];

/** @type {SourceListSliceId[]} */
export const SOURCE_LIST_SLICE_ORDER = SOURCE_LIST_SLICE_DEFS.map((d) => d.id);

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
export function buildBillSourceLoadingGroups() {
  /** @type {import("./source-modal.js").SourceGroup[]} */
  const groups = [
    {
      id: "nic",
      name: "Not in computer (NIC)",
      items: [{ label: "NIC — enter this Bill manually (no source)", kind: "nic" }],
    },
  ];
  for (const def of SOURCE_LIST_SLICE_DEFS) {
    groups.push(loadingGroupForSlice(def.id));
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
        kind: "po",
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
