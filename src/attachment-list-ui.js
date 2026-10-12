/**
 * The attachments table under a Doc skin's notes (5zorro 2026-10-12), Bill and doc-form alike:
 * one row per attached file, with Peek (the Papers pane, on that file) and Download (save it).
 * Rows come from src/attachment-list.js; files travel over the Papers channels.
 */
import { attachmentSource, attachmentRows } from "./attachment-list.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @param {{
 *   api: { papersList: Function, papersDownload: Function },
 *   host: HTMLElement|null,
 *   getDoc: () => any,
 *   onPeek: (fileUrl: string) => Promise<boolean>|boolean,
 *   setStatus?: (text: string, kind?: string) => void,
 *   testidPrefix?: string,
 * }} opts
 */
export function mountAttachmentList(opts) {
  const { api, host, getDoc, onPeek } = opts;
  const setStatus = opts.setStatus || (() => {});
  const tid = opts.testidPrefix || "doc";
  let loadedFor = "";
  let token = 0;

  async function refresh(force = false) {
    if (!host) return;
    const src = attachmentSource(getDoc());
    const key = src ? `${src.doctype}\u0000${src.name}` : "";
    if (!force && key === loadedFor) return;
    loadedFor = key;
    const mine = ++token;
    if (!src || !api || !api.papersList) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    const res = await api.papersList([src]).catch((e) => ({ ok: false, reason: String(e) }));
    if (mine !== token) return;
    if (!res || res.ok === false) {
      host.hidden = false;
      host.innerHTML = `<p class="attach-list-note err">${esc((res && res.reason) || "Could not list the attached files.")}</p>`;
      return;
    }
    const rows = attachmentRows(res.files);
    host.hidden = !rows.length;
    if (!rows.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `<table class="attach-list" data-testid="${tid}-attach-list">
      <caption>Attached files (${rows.length})</caption>
      <tbody>${rows
        .map(
          (r) => `<tr data-file-url="${esc(r.fileUrl)}">
            <td class="al-name" title="${esc(r.fileName)}">${esc(r.fileName)}</td>
            <td class="al-meta">${esc([r.size, r.added].filter(Boolean).join(" · "))}</td>
            <td class="al-act"><button type="button" data-al="peek" title="Show it in the Papers pane, beside this document">Peek</button>
              <button type="button" data-al="download" title="Save a copy of this file">Download</button></td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
    host.querySelectorAll("tr[data-file-url]").forEach((tr, i) => {
      const row = rows[i];
      /** @type {HTMLButtonElement} */ (tr.querySelector('[data-al="peek"]')).onclick = async () => {
        const shown = await onPeek(row.fileUrl);
        if (shown === false) setStatus(`${row.fileName} did not appear in Papers — it may have been removed.`, "warn");
      };
      /** @type {HTMLButtonElement} */ (tr.querySelector('[data-al="download"]')).onclick = async () => {
        setStatus(`Downloading ${row.fileName}…`);
        const r = await api.papersDownload({ fileUrl: row.fileUrl, fileName: row.fileName }).catch((e) => ({ ok: false, reason: String(e) }));
        if (r && r.cancelled) setStatus("");
        else setStatus(r && r.ok ? `Saved ${row.fileName} to ${r.path}.` : (r && r.reason) || `Could not download ${row.fileName}.`, r && r.ok ? "" : "err");
      };
    });
  }

  return { refresh };
}
