/**
 * A minimal ZIP writer for the compare pane's "Save all as ZIP" (5zorro 2026-10-03). Files are
 * *stored*, not compressed: scans, photos and PDFs are compressed already, and storing keeps this
 * small, dependency-free and testable. Pure — Uint8Array in, Uint8Array out.
 */

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A file name as it really is, for showing and saving (architecture review 2026-10-19). Invisible
 * format characters go — U+202E (right-to-left override) makes `invoice\u202Efdp.exe` *display* as
 * `invoiceexe.pdf` — and so do control characters; long runs of spaces shrink to one, so
 * `scan.pdf      .exe` cannot push its real extension out of sight.
 * @param {unknown} name
 * @returns {string}
 */
export function plainFileName(name) {
  return String(name ?? "")
    .replace(/[\p{Cf}\p{Cc}]+/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The first of `name`, `name (2)`, `name (3)` … that is not taken — for saving beside files that
 * may already be there.
 * @param {string} name
 * @param {(candidate: string) => boolean} isTaken
 * @returns {string}
 */
export function freeFileName(name, isTaken) {
  let candidate = name;
  let n = 2;
  while (isTaken(candidate)) {
    candidate = name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext || ""}`);
    n += 1;
  }
  return candidate;
}

/**
 * Names inside one ZIP must differ: "scan.pdf" twice becomes "scan.pdf" and "scan (2).pdf".
 * Path separators are flattened so nothing unpacks outside its folder.
 * @param {string[]} names
 * @returns {string[]}
 */
export function uniqueZipNames(names) {
  const used = new Set();
  return (names || []).map((raw) => {
    const clean = plainFileName(raw || "file").replace(/[\\/]+/g, "-").replace(/^\.+/, "") || "file";
    let name = clean;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      name = clean.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext || ""}`);
      n += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * @param {Array<{ name: string, bytes: Uint8Array }>} files
 * @param {Date} [when] one timestamp for every entry
 * @returns {Uint8Array} a .zip
 */
export function buildZip(files, when = new Date()) {
  const enc = new TextEncoder();
  const names = uniqueZipNames((files || []).map((f) => f.name));
  const dosTime = ((when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff;
  const parts = [];
  const central = [];
  let offset = 0;
  (files || []).forEach((f, i) => {
    const name = enc.encode(names[i]);
    const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || []);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, (files || []).length, true);
  end.setUint16(10, (files || []).length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
