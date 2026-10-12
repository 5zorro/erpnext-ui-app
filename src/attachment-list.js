/**
 * The document's attached files as a small table under its notes, beside Attach (5zorro
 * 2026-10-12: "a small table with a clickable list of peek attachment and download attachment").
 * Pure: which document to ask about, and the rows the page draws from ERPNext's File records.
 * The files themselves come over the Papers pane's channels (`papers-list`, `papers-bytes`).
 */

/**
 * @typedef {{ name?: string, file_name?: string, file_url?: string, is_private?: number|string,
 *   creation?: string, file_size?: number|string }} FileRecord
 * @typedef {{ key: string, fileName: string, fileUrl: string, size: string, added: string,
 *   isPrivate: boolean }} AttachmentRow
 */

/**
 * The document whose files to list — only a saved one has a name ERPNext attaches to.
 * @param {{ doctype?: string, name?: string }|null|undefined} doc
 * @returns {{ doctype: string, name: string }|null}
 */
export function attachmentSource(doc) {
  const doctype = doc && doc.doctype ? String(doc.doctype) : "";
  const name = doc && doc.name != null ? String(doc.name).trim() : "";
  if (!doctype || !name || /^new(-|$)/i.test(name)) return null;
  return { doctype, name };
}

/**
 * @param {number|string|null|undefined} bytes
 * @returns {string} e.g. "820 B", "14 KB", "2.3 MB"; "" when unknown
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0 || bytes === "" || bytes == null) return "";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * @param {string|null|undefined} stamp ERPNext datetime, "2026-10-11 20:50:45.798404"
 * @returns {string} "10/11/2026", or "" when it cannot be read
 */
export function formatAddedDate(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(stamp || ""));
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "";
}

/** The file's own name: `file_name`, else the last part of its address. */
function fileNameOf(f) {
  const own = f.file_name != null ? String(f.file_name).trim() : "";
  if (own) return own;
  const url = String(f.file_url || "");
  const last = url.split("/").pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Rows in the order they were attached (oldest first, as the Papers pane and Desk's sidebar list
 * them). A record with no address is not a file this page can show or save, so it is left out.
 * @param {FileRecord[]|null|undefined} files
 * @returns {AttachmentRow[]}
 */
export function attachmentRows(files) {
  const list = Array.isArray(files) ? files : [];
  return list
    .filter((f) => f && f.file_url)
    .slice()
    .sort((a, b) => String(a.creation || "").localeCompare(String(b.creation || "")))
    .map((f) => ({
      key: String(f.name || f.file_url),
      fileName: fileNameOf(f),
      fileUrl: String(f.file_url),
      size: formatFileSize(f.file_size),
      added: formatAddedDate(f.creation),
      isPrivate: Number(f.is_private) === 1,
    }));
}
