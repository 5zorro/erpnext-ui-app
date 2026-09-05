/**
 * Item import modal + apply (OI-132) — Electron Doc skins only; mouse-first chrome.
 */

import {
  parseGridText,
  detectHeaderRow,
  guessColumnMap,
  defaultRowRoles,
  importColumnOptions,
  editableImportFields,
  rowsToImportRecords,
  validateImportRecords,
  resolveImportRecord,
  importFieldWriteOrder,
  mergeImportDescription,
  applyIgnoreFirstRows,
  isIgnoredImportRow,
  MAX_ITEM_IMPORT_ROWS,
  IMPORT_COL_IGNORE,
} from "./item-import-cleaner.js";

/**
 * @typedef {import("./item-import-cleaner.js").ItemImportRowRole} ItemImportRowRole
 */

/**
 * @typedef {{ cancelled: true } | { cancelled: false, records: Record<string, string>[], replace: boolean }} ItemImportModalResult
 */

/**
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string[][]} rows
 * @param {boolean} hasHeaderRow
 * @param {number} ignoreFirstN
 * @returns {string[]}
 */
function headerRowForMapping(rows, hasHeaderRow, ignoreFirstN) {
  if (!hasHeaderRow || !rows.length) return [];
  if (ignoreFirstN > 0 && rows[ignoreFirstN - 1]) return rows[ignoreFirstN - 1];
  return rows[0] || [];
}

/**
 * @param {ItemImportRowRole} role
 * @returns {string}
 */
function rowRoleLabel(role) {
  if (role === "header") return "Ignore (header)";
  if (role === "skip") return "Ignore (junk)";
  return "Data row";
}

/**
 * @param {Array<{ label?: string, field?: string|null, displayOnly?: boolean }>} itemCols
 * @param {{ testId?: string }} [opts]
 * @returns {Promise<ItemImportModalResult>}
 */
export function openItemImportModal(itemCols, opts = {}) {
  const testId = opts.testId || "item-import";
  const columnOptions = importColumnOptions(itemCols);
  const editableFields = editableImportFields(itemCols);

  return new Promise((resolve) => {
    /** @type {string[][]} */
    let parsedRows = [];
    /** @type {string[]} */
    let columnMap = [];
    /** @type {ItemImportRowRole[]} */
    let rowRoles = [];
    let hasHeaderRow = false;
    let ignoreFirstN = 0;
    let columnMapInitialized = false;
    /** @type {string[]} */
    let parseWarnings = [];

    const back = document.createElement("div");
    back.className = "src-back";
    back.dataset.testid = `${testId}-modal`;
    const box = document.createElement("div");
    box.className = "src-box imp-box";
    box.tabIndex = -1;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Import item lines");
    box.innerHTML = `<div class="src-title">Import lines — paste spreadsheet or browse CSV</div>
      <div class="src-body imp-body"></div>
      <div class="src-foot imp-foot">
        <button type="button" class="primary" data-act="apply" data-testid="${testId}-apply" disabled tabindex="-1">Apply to items table</button>
        <button type="button" data-act="cancel" tabindex="-1">Cancel</button>
      </div>`;
    back.appendChild(box);
    document.body.appendChild(back);

    const body = box.querySelector(".imp-body");
    const applyBtn = box.querySelector('[data-act="apply"]');
    const cancelBtn = box.querySelector('[data-act="cancel"]');

    function close(cancelled, payload) {
      document.removeEventListener("keydown", onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      if (cancelled) resolve({ cancelled: true });
      else resolve(payload);
    }

    function syncColumnMapFromDom() {
      body.querySelectorAll(".imp-col-map").forEach((sel) => {
        const ci = Number(/** @type {HTMLElement} */ (sel).dataset.col);
        columnMap[ci] = /** @type {HTMLSelectElement} */ (sel).value || IMPORT_COL_IGNORE;
      });
    }

    function syncRowRolesFromDom() {
      body.querySelectorAll(".imp-row-role").forEach((sel) => {
        const ri = Number(/** @type {HTMLElement} */ (sel).dataset.row);
        rowRoles[ri] = /** @type {ItemImportRowRole} */ (/** @type {HTMLSelectElement} */ (sel).value);
      });
    }

    function rebuildPreview() {
      if (!parsedRows.length) {
        applyBtn.disabled = true;
        return;
      }

      if (!columnMapInitialized || columnMap.length !== (parsedRows[0]?.length || 0)) {
        const headerRow = headerRowForMapping(parsedRows, hasHeaderRow, ignoreFirstN);
        columnMap = guessColumnMap(headerRow, columnOptions, parsedRows[0]?.length || 0);
        columnMapInitialized = true;
      }
      if (!rowRoles.length || rowRoles.length !== parsedRows.length) {
        rowRoles = defaultRowRoles(parsedRows.length, hasHeaderRow);
      }
      if (ignoreFirstN > 0) {
        rowRoles = applyIgnoreFirstRows(rowRoles, ignoreFirstN);
      }

      const records = rowsToImportRecords(parsedRows, {
        columnMap,
        rowRoles,
        editableFields,
      });
      const validation = validateImportRecords(records);
      applyBtn.disabled = !validation.ok;

      const previewMax = 20;
      const colCount = parsedRows[0]?.length || 0;
      const mapSelects = Array.from({ length: colCount })
        .map((_v, ci) => {
          const optsHtml = columnOptions
            .map(
              (opt) =>
                `<option value="${esc(opt.value)}"${columnMap[ci] === opt.value ? " selected" : ""}>${esc(opt.label)}</option>`,
            )
            .join("");
          return `<th><select class="imp-col-map" data-col="${ci}" tabindex="-1" title="Column ${ci + 1}">${optsHtml}</select></th>`;
        })
        .join("");

      const previewRows = parsedRows
        .slice(0, previewMax)
        .map((row, ri) => {
          const role = rowRoles[ri] || "data";
          const ignored = isIgnoredImportRow(role);
          const cells = row.map((c) => `<td>${esc(c)}</td>`).join("");
          const roleOpts = ["data", "header", "skip"]
            .map(
              (r) =>
                `<option value="${r}"${role === r ? " selected" : ""}>${rowRoleLabel(/** @type {ItemImportRowRole} */ (r))}</option>`,
            )
            .join("");
          return `<tr class="${ignored ? "imp-ignored" : ""}">
            <td><select class="imp-row-role" data-row="${ri}" tabindex="-1">${roleOpts}</select></td>
            ${cells}
          </tr>`;
        })
        .join("");

      const ignoredCount = rowRoles.filter((r) => isIgnoredImportRow(r)).length;
      const warnHtml = [...parseWarnings, ...validation.warnings, ...validation.errors]
        .map((w) => `<p class="imp-warn">${esc(w)}</p>`)
        .join("");

      body.innerHTML = `
        <p class="imp-hint">Mark junk/header rows as <b>Ignore</b>. Map only the columns you need — all others stay ignored. Extended amount divides by Qty to get unit rate.</p>
        <div class="imp-controls">
          <label class="imp-check"><input type="checkbox" id="imp-has-header" tabindex="-1"${hasHeaderRow ? " checked" : ""} /> Row 1 is column headers (for auto-map)</label>
          <label class="imp-check">Ignore first
            <input type="number" id="imp-ignore-n" min="0" max="99" value="${ignoreFirstN}" tabindex="-1" style="width:3rem;margin:0 4px;" />
            rows</label>
          <label class="imp-check imp-replace"><input type="checkbox" id="imp-replace" tabindex="-1" /> Replace existing lines (default: append)</label>
          <span class="imp-meta">${records.length} data row(s) · ${ignoredCount} ignored · max ${MAX_ITEM_IMPORT_ROWS}</span>
        </div>
        ${warnHtml}
        <div class="imp-scroll">
          <table class="imp-preview">
            <thead><tr><th>Row</th>${mapSelects}</tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
          ${parsedRows.length > previewMax ? `<p class="imp-meta">Showing first ${previewMax} of ${parsedRows.length} pasted rows — ignored rows beyond this still apply.</p>` : ""}
        </div>`;

      body.querySelector("#imp-has-header").addEventListener("change", (ev) => {
        syncRowRolesFromDom();
        syncColumnMapFromDom();
        hasHeaderRow = /** @type {HTMLInputElement} */ (ev.target).checked;
        if (hasHeaderRow && rowRoles[0] !== "skip") rowRoles[0] = "header";
        else if (!hasHeaderRow && rowRoles[0] === "header") rowRoles[0] = "data";
        columnMapInitialized = false;
        rebuildPreview();
      });
      body.querySelector("#imp-ignore-n").addEventListener("change", (ev) => {
        syncRowRolesFromDom();
        syncColumnMapFromDom();
        ignoreFirstN = Math.max(0, Number(/** @type {HTMLInputElement} */ (ev.target).value) || 0);
        rowRoles = applyIgnoreFirstRows(
          rowRoles.length === parsedRows.length
            ? rowRoles
            : defaultRowRoles(parsedRows.length, hasHeaderRow),
          ignoreFirstN,
        );
        rebuildPreview();
      });
      body.querySelectorAll(".imp-col-map").forEach((sel) => {
        sel.addEventListener("change", (ev) => {
          syncRowRolesFromDom();
          const ci = Number(/** @type {HTMLElement} */ (ev.target).dataset.col);
          columnMap[ci] = /** @type {HTMLSelectElement} */ (ev.target).value || IMPORT_COL_IGNORE;
          rebuildPreview();
        });
      });
      body.querySelectorAll(".imp-row-role").forEach((sel) => {
        sel.addEventListener("change", (ev) => {
          syncColumnMapFromDom();
          const ri = Number(/** @type {HTMLElement} */ (ev.target).dataset.row);
          rowRoles[ri] = /** @type {ItemImportRowRole} */ (/** @type {HTMLSelectElement} */ (ev.target).value);
          rebuildPreview();
        });
      });
    }

    function drawInputStep() {
      applyBtn.disabled = true;
      body.innerHTML = `
        <p class="imp-hint">Paste from Excel/Sheets (tab-separated) or choose a .csv file. Next: ignore dirty header rows and map only SKU, Qty, rate/extended, and optional description append.</p>
        <textarea class="imp-paste" id="imp-paste" rows="8" placeholder="Paste vendor export here…" data-testid="${testId}-paste"></textarea>
        <div class="imp-file-row">
          <button type="button" class="imp-browse" id="imp-browse" tabindex="-1" data-testid="${testId}-browse">Browse CSV…</button>
          <input type="file" id="imp-file" accept=".csv,.tsv,text/csv,text/plain" hidden tabindex="-1" />
          <button type="button" class="imp-preview-btn" id="imp-preview" tabindex="-1" data-testid="${testId}-preview">Preview mapping</button>
        </div>
        <div id="imp-parse-warn"></div>`;

      const paste = body.querySelector("#imp-paste");
      const fileInput = body.querySelector("#imp-file");
      const browse = body.querySelector("#imp-browse");
      const previewBtn = body.querySelector("#imp-preview");

      browse.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          paste.value = await file.text();
          runParse(paste.value);
        } catch {
          body.querySelector("#imp-parse-warn").innerHTML =
            `<p class="imp-warn">Could not read that file.</p>`;
        }
      };
      previewBtn.onclick = () => runParse(paste.value);

      function runParse(text) {
        const parsed = parseGridText(text);
        parseWarnings = parsed.warnings;
        if (!parsed.rows.length) {
          body.querySelector("#imp-parse-warn").innerHTML = parsed.warnings
            .map((w) => `<p class="imp-warn">${esc(w)}</p>`)
            .join("");
          parsedRows = [];
          applyBtn.disabled = true;
          return;
        }
        parsedRows = parsed.rows;
        hasHeaderRow = detectHeaderRow(parsedRows, columnOptions);
        ignoreFirstN = 2;
        if (!detectHeaderRow(parsedRows.slice(1), columnOptions)) {
          ignoreFirstN = hasHeaderRow ? 1 : 0;
        }
        rowRoles = defaultRowRoles(parsedRows.length, hasHeaderRow);
        if (ignoreFirstN > 0) rowRoles = applyIgnoreFirstRows(rowRoles, ignoreFirstN);
        columnMapInitialized = false;
        rebuildPreview();
      }
    }

    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close(true);
      }
    }

    cancelBtn.onclick = () => close(true);
    applyBtn.onclick = () => {
      syncColumnMapFromDom();
      syncRowRolesFromDom();
      const records = rowsToImportRecords(parsedRows, {
        columnMap,
        rowRoles,
        editableFields,
      });
      const validation = validateImportRecords(records);
      if (!validation.ok) {
        rebuildPreview();
        return;
      }
      const replaceEl = body.querySelector("#imp-replace");
      const replace = !!(replaceEl && /** @type {HTMLInputElement} */ (replaceEl).checked);
      close(false, { cancelled: false, records, replace });
    };

    document.addEventListener("keydown", onKey, true);
    drawInputStep();
    try {
      box.focus();
    } catch {
      /* ignore */
    }
  });
}

/**
 * @param {{ setItem: Function, addItem: Function, deleteItem: Function }} api
 * @param {Record<string, string>[]} records
 * @param {{ replace?: boolean, currentRowCount?: number, onProgress?: (msg: string) => void }} [opts]
 * @returns {Promise<{ ok: boolean, doc?: object, scratch?: object, reason?: string }>}
 */
export async function applyImportedItemRows(api, records, opts = {}) {
  if (!api || !records.length) {
    return { ok: false, reason: "Nothing to import." };
  }
  const replace = !!opts.replace;
  let rowCount = Math.max(0, Number(opts.currentRowCount) || 0);
  /** @type {object|null} */
  let lastDoc = null;
  /** @type {object|undefined} */
  let lastScratch = undefined;

  const progress = (msg) => {
    if (opts.onProgress) opts.onProgress(msg);
  };

  if (replace) {
    while (rowCount > records.length && rowCount > 1) {
      progress(`Removing extra line ${rowCount}…`);
      const del = await api.deleteItem(rowCount - 1);
      if (!(del && del.ok)) {
        return { ok: false, reason: (del && del.reason) || "Could not remove extra lines." };
      }
      lastDoc = del.doc;
      lastScratch = del.scratch;
      rowCount = del.doc && Array.isArray(del.doc.items) ? del.doc.items.length : rowCount - 1;
    }
  }

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const { writes, appendDescription } = resolveImportRecord(raw);
    let ri = i;

    if (replace) {
      if (i >= rowCount) {
        progress(`Adding line ${i + 1} of ${records.length}…`);
        const added = await api.addItem();
        if (!(added && added.ok)) {
          return { ok: false, reason: (added && added.reason) || "Add line failed during import." };
        }
        lastDoc = added.doc;
        lastScratch = added.scratch;
        rowCount = added.doc && Array.isArray(added.doc.items) ? added.doc.items.length : rowCount + 1;
        ri = rowCount - 1;
      }
    } else {
      progress(`Adding line ${i + 1} of ${records.length}…`);
      const added = await api.addItem();
      if (!(added && added.ok)) {
        return { ok: false, reason: (added && added.reason) || "Add line failed during import." };
      }
      lastDoc = added.doc;
      lastScratch = added.scratch;
      ri = added.doc && Array.isArray(added.doc.items) ? added.doc.items.length - 1 : rowCount;
      rowCount = added.doc && Array.isArray(added.doc.items) ? added.doc.items.length : rowCount + 1;
    }

    for (const field of importFieldWriteOrder(writes)) {
      const value = writes[field];
      if (value == null || value === "") continue;
      progress(`Line ${i + 1}: ${field}…`);
      const res = await api.setItem(ri, field, value);
      if (!(res && res.ok)) {
        return { ok: false, reason: (res && res.reason) || `Could not set ${field} on line ${i + 1}.` };
      }
      lastDoc = res.doc;
      lastScratch = res.scratch;
    }

    if (appendDescription && lastDoc && Array.isArray(lastDoc.items) && lastDoc.items[ri]) {
      const existing = lastDoc.items[ri].description;
      const merged = mergeImportDescription(existing, appendDescription, writes.description);
      const prev = String(existing ?? "").trim();
      if (merged !== prev) {
        progress(`Line ${i + 1}: append description…`);
        const res = await api.setItem(ri, "description", merged);
        if (!(res && res.ok)) {
          return {
            ok: false,
            reason: (res && res.reason) || `Could not append description on line ${i + 1}.`,
          };
        }
        lastDoc = res.doc;
        lastScratch = res.scratch;
      }
    }
  }

  return { ok: true, doc: lastDoc || undefined, scratch: lastScratch };
}

/**
 * Shared click-only chrome wiring for Doc item tables.
 * @param {{
 *   button: HTMLElement|null,
 *   getItemCols: () => Array<{ label?: string, field?: string|null, displayOnly?: boolean }>,
 *   getApi: () => { setItem: Function, addItem: Function, deleteItem: Function }|null,
 *   isEditable: () => boolean,
 *   getCurrentRowCount: () => number,
 *   onApplied: (result: { doc?: object, scratch?: object }) => void,
 *   setStatus: (msg: string, kind?: string) => void,
 *   testId?: string,
 * }} opts
 */
export function wireItemImportButton(opts) {
  const btn = opts.button;
  if (!btn) return;
  btn.tabIndex = -1;
  btn.onclick = async () => {
    if (!opts.isEditable()) {
      opts.setStatus("Import is only available while the document is editable.", "warn");
      return;
    }
    const api = opts.getApi();
    const itemCols = opts.getItemCols();
    if (!api || !itemCols.length) return;
    const choice = await openItemImportModal(itemCols, { testId: opts.testId });
    if (choice.cancelled) return;
    opts.setStatus("Applying import…");
    const applied = await applyImportedItemRows(api, choice.records, {
      replace: choice.replace,
      currentRowCount: opts.getCurrentRowCount(),
      onProgress: (msg) => opts.setStatus(msg),
    });
    if (applied.ok) {
      opts.onApplied(applied);
      opts.setStatus(
        `Imported ${choice.records.length} line(s)${choice.replace ? " (replaced existing)" : ""}.`,
      );
    } else {
      opts.setStatus(applied.reason || "Import failed.", "err");
    }
  };
}
