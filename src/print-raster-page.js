/**
 * Printer hardening — "print as image" (plan 2026-09-26, 5zorro 2026-10-03). Runs in
 * electron/print-raster.html, a hidden window: draws each PDF page onto white with PDF.js at printer
 * resolution and lays the pictures out one per page, at the PDF's own page size, for main to print
 * or turn back into a (flat) PDF.
 */
const pdfjs = await import(new URL("../node_modules/pdfjs-dist/build/pdf.min.mjs", import.meta.url).href);
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

/**
 * @param {string} b64 the PDF
 * @param {number} dpi
 * @returns {Promise<{ pages: number, widthPt: number, heightPt: number }>}
 */
window.rasterize = async (b64, dpi = 240) => {
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) data[i] = bin.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data }).promise;
  document.body.querySelectorAll(".pg").forEach((n) => n.remove());
  let first = null;
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const unit = page.getViewport({ scale: 1 }); // points
    if (!first) first = unit;
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // flatten: no transparency survives
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
    const box = document.createElement("div");
    box.className = "pg";
    box.style.width = `${unit.width}pt`;
    box.style.height = `${unit.height}pt`;
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    box.appendChild(img);
    document.body.appendChild(box);
    await img.decode().catch(() => {});
  }
  document.getElementById("page-size").textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0; }`;
  return { pages: pdf.numPages, widthPt: first.width, heightPt: first.height };
};
window.rasterReady = true;
