/**
 * Spreadsheets in the compare pane (5zorro 2026-10-03): "csv and spreadsheets that are only one page
 * is enough" — and not "a csv that accidentally takes up 20 pages and no headers". A CSV or the
 * first sheet of an .xlsx is shown as a plain table when it fits one page; anything bigger says to
 * open it in Excel. Values only, no formatting. No library: an .xlsx is a ZIP of XML, unzipped with
 * the platform's own DecompressionStream (Chromium and Node both have it).
 */

/** One page of a table: beyond this it would spill (or shrink unreadably). */
export const SHEET_MAX_ROWS = 45;
export const SHEET_MAX_COLS = 10;

/**
 * CSV → rows. Quotes, doubled quotes, newlines inside quotes; the delimiter is whichever of
 * comma / semicolon / tab the first line uses most.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return trimSheet(rows);
}

/** Drop trailing empty rows and columns (a spreadsheet's export often carries them). */
export function trimSheet(rows) {
  const r = (rows || []).map((x) => (Array.isArray(x) ? x.map((c) => String(c ?? "")) : []));
  while (r.length && r[r.length - 1].every((c) => c.trim() === "")) r.pop();
  let cols = 0;
  for (const row of r) {
    for (let c = row.length - 1; c >= 0; c -= 1) {
      if (row[c].trim() !== "") {
        cols = Math.max(cols, c + 1);
        break;
      }
    }
  }
  return r.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? ""));
}

/**
 * @param {string[][]} rows
 * @returns {{ fits: boolean, rows: number, cols: number }}
 */
export function sheetFitsOnePage(rows) {
  const n = (rows || []).length;
  const cols = Math.max(0, ...(rows || []).map((r) => r.length));
  return { fits: n > 0 && n <= SHEET_MAX_ROWS && cols <= SHEET_MAX_COLS, rows: n, cols };
}

/** What the pane says when a sheet is more than one page. */
export function sheetTooBigNote(fileName, size) {
  return `${fileName} is more than one page (${size.rows} rows × ${size.cols} columns) — open it in its own program (Excel) and print from there.`;
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The rows as a plain table, the first row as its header. */
export function sheetTableHtml(rows) {
  const [head, ...body] = rows || [];
  if (!head) return "<p>(empty)</p>";
  return `<table class="sheet"><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/* ---------------- .xlsx: first sheet, values only ---------------- */

/** ZIP central directory → { name → entry } (stored or deflated). */
function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a ZIP / .xlsx file");
  const count = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let k = 0; k < count; k += 1) {
    if (dv.getUint32(at, true) !== 0x02014b50) break;
    const method = dv.getUint16(at + 10, true);
    const size = dv.getUint32(at + 20, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const commentLen = dv.getUint16(at + 32, true);
    const local = dv.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    out[name] = { method, data: bytes.subarray(start, start + size) };
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function entryText(entry) {
  if (!entry) return "";
  if (entry.method === 0) return new TextDecoder().decode(entry.data);
  if (entry.method !== 8) throw new Error("unsupported compression in .xlsx");
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const unxml = (s) =>
  String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** "C7" → column index 2. */
function colIndex(ref) {
  const letters = (String(ref).match(/^[A-Z]+/) || ["A"])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The first worksheet of an .xlsx as rows of text (values only; dates stay Excel serial numbers).
 * @param {Uint8Array} bytes
 * @returns {Promise<string[][]>}
 */
export async function readXlsxFirstSheet(bytes) {
  const entries = zipEntries(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const sheetName = Object.keys(entries).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))[0];
  if (!sheetName) throw new Error("no worksheet in this .xlsx");
  const shared = [];
  const sst = await entryText(entries["xl/sharedStrings.xml"]);
  for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join(""));
  }
  const xml = await entryText(entries[sheetName]);
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row = [];
    for (const cm of (rm[1] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="([a-zA-Z]+)"/) || [])[1] || "";
      const inner = cm[2] || "";
      let value = "";
      if (type === "s") value = shared[Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? "";
      else if (type === "inlineStr") value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join("");
      else if (type === "b") value = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] === "1" ? "TRUE" : "FALSE";
      else value = unxml((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? "");
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push("");
      row[at] = value;
    }
    rows.push(row);
  }
  return trimSheet(rows);
}
