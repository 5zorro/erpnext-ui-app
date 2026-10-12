# Implementation plan — 2026-10-12

**Tranche:** the Sales Order as the A/R dashboard — what it creates shows up in its own tables, the
way the Bill is the A/P dashboard. Agreed with 5zorro 2026-10-12 (read back, then confirmed).

**Runs alongside** `implementation-plan-2026-09-26.md` (DF-02 follow-ups; dogfood of the papers
continues) and `-10-03` (the trace — its link registry and graph are reused here, its pages are
not built). Nothing here edits the trace pages or the Find pages.

---

## How to handle cross-architecture dogfood

Same as plan 2026-10-03 § *How to handle cross-architecture dogfood*: sort feedback into
architecture families, one family per slice, `npm test` green per slice.

---

## What 5zorro asked for, with his example

His Sales Order: SAMPLE-SKU-01 × 2, SAMPLE-SKU-02 × 2. SKU-01 is bought on a PO, SKU-02 ships
from stock. The order's items table says so:

| Line | Item | Qty | Sources |
|---|---|---|---|
| 1 | SAMPLE-SKU-01 | 2 | PO PUR-ORD-…-0001 ×2 (draft) |
| 2 | SAMPLE-SKU-02 | 2 | Stock ×2 |

One line can have two sources — line 1 at 5 units: `PO …-0001 ×3 · Stock ×2`. A Work Order
reads the same way: `WO-…-0001 ×5 (to build)`. Nothing yet: `Not sourced ×2 (QOH ×7 Nos)`.

## Stages (build order)

### S1 — Drafts wears a yellow border when it holds anything (built 2026-10-12)

The flyout's Drafts section, whenever it shows (it is hidden when empty). A saved draft posts
nothing; the border is a standing reminder (5zorro: "drafts don't actually post and can confuse if
you thought you submitted it"). One colour, no count. The collapsed rail shows the same yellow on
its strip, since that is when the section cannot be seen. `electron/history.html` (`has-drafts` on
the body). Checked by screenshot (open and collapsed); no app test — it is CSS on a section that
was already shown and hidden by the shelf.

### S2 — Create ▾ on the Sales Order Doc skin: Purchase Order… (built 2026-10-12)

Mirrors Vanilla's Create › Purchase Order (`sales_order.js` `make_purchase_order`):

- Only on a **submitted** order (ERPNext's mapper validates `docstatus = 1`).
- A picker in the skin: the lines with quantity still to order (stock qty − already ordered), a
  **Vendor** box for every ticked line, and a per-line override.
- ERPNext's own `erpnext.selling.doctype.sales_order.sales_order.make_purchase_order` builds one PO
  per vendor (`selected_items` carries each line's vendor). Each PO line keeps `sales_order` +
  `sales_order_item`; the sale price is not copied (the vendor's price applies).
- **Every PO is saved as a draft** and lands on the Drafts shelf (5zorro). The page **stays on the
  Sales Order** — the yellow Drafts border and the Sources column are the trail.
- The menu lists only Purchase Order at first; the rest of Create comes with S5.

**Built:** `src/so-create-po.js` (pure: which lines, how much, what to send, the message),
`src/so-create-po-ui.js` (the menu — each entry in its document's wash — and the picker), IPC
`so-create-po-context` / `so-create-pos`, `createMenu` on the Sales Order profile. Found while
building:

- **ERPNext's mapper saves the POs itself** (v16 `make_purchase_order`: `if doc.supplier:
  doc.insert()`), so Vanilla's Create leaves drafts too. The first cut saved them again and made
  four POs for two — the app test caught it.
- **Draft POs count as ordered here.** ERPNext raises a line's `ordered_qty` only on PO *submit*;
  with every PO a draft, a second Create would order the same goods again. The picker subtracts
  quantity on draft POs that point at this order (and names them); a line partly on an older draft
  is trimmed on the new PO after ERPNext saves it.
- ERPNext picks the vendor **per item code** — the same item on two lines takes one vendor (the
  picker says so). The whole remaining quantity is ordered, as in Vanilla; bundles are skipped.

App test (5zorro's submitted order, two vendors): menu entry in the order wash; two draft POs, one
per vendor, every line linked back; stays on the order with the message; Drafts shows them in
yellow; Create again says every line is already ordered. The POs are deleted after (ERPNext hands
the last number back on delete, so the numbering is unchanged).

### S3 — The PO's source picker: NIC, Material Request, Supplier Quotation, Sales Order (built 2026-10-12)

As the Bill's picker offers NIC / PO / Item Receipt, the PO's offers every source ERPNext can map
from: **NIC** (no source), **Material Request** and **Supplier Quotation** (Vanilla's Get Items
From), and **Sales Order** — beyond Vanilla's PO form, but through ERPNext's own mapper
(`make_purchase_order` takes a `target_doc`), so Clean Core holds.

**Built:** the slices are now **per skin** (`SOURCE_SLICES_BY_SKIN` in `src/source-list-slices.js`):
Bill — PO / Item Receipt, submitted and draft (unchanged); **Item Receipt — POs only** (it listed
Item Receipts too, which its merge refused: a pick that could only fail); **PO — Material Requests
still to order, this vendor's Supplier Quotations, Sales Orders still to order**. The merge picks
ERPNext's mapper by skin and kind (`src/po-source.js`) and copies the lines into the open form
(`mergeFromMapped`), each keeping its link back. Found while building:

- The Sales Order mapper **saves** a PO for any vendor it is given, so the picker asks it with
  **no vendor** — it then returns the PO unsaved (proven against 5zorro's order, nothing saved) —
  and the form keeps the vendor already picked. Lines already on draft POs are trimmed, as in S2.
- A Material Request names no vendor: every open purchase request is listed (as Vanilla's Get Items
  From does). A Supplier Quotation is this vendor's only.
- Prices: a Supplier Quotation's lines bring their prices; a Sales Order's do not (ERPNext does not
  copy a sale price onto a purchase) — the clerk types the vendor's price.

App test: a new PO for a vendor; the picker shows NIC ("this Purchase Order") and 5zorro's order
under *Sales Orders — still to order*, no Item Receipts; choosing it fills the PO with both lines
linked back; the vendor stays; nothing saved. **Not run live:** Material Request and Supplier
Quotation (the sandbox has none) — their lists and mappers are unit-tested and the methods are the
ones Vanilla's Get Items From calls.

### S4 — The Sources column on the Sales Order's items table

Read from the trace code (`src/trace-links.js` / `src/trace-graph.js`), which already follows
PO, Material Request, Delivery Note and Sales Invoice lines back to a Sales Order line. **Add
Work Order** to the registry (`Work Order.sales_order` / `sales_order_item`), matching Vanilla.

**The stock rule (agreed):** ERPNext keeps each order line's **Delivered qty**, raised by a Delivery
Note and by a Sales Invoice with *Update Stock* ticked (billed and shipped in one step; an invoice
without it bills but ships nothing). So:

- `Stock ×N` — N = the line's delivered qty + any qty reserved on the order (Reserve Stock);
- `Not sourced (QOH ×N UOM)` — whatever no PO, Work Order, delivery or reservation covers, with
  the quantity on hand beside it.

Each source links to its document (peek), in its own doc wash.

### S5 — Create as a list *or* a flowchart, the clerk's choice

List first (S2's menu, grown to Vanilla's other Create entries — Delivery Note, Sales Invoice,
Work Order, Material Request, …), **each entry in its document's wash**. Then a flowchart view,
drawn from the bowtie mockup (`docs/mockups/bowtie-trace.html`): the Sales Order in the middle,
Estimate before it, PO / Work Order / Material Request beside, Delivery Note → Invoice → Payment
after; each box shows what exists and offers *create* where nothing does. A **List ⇄ Flowchart**
toggle, remembered per clerk. Mockup first for the flowchart.

## Open questions

- None blocking S1–S2.

## Dogfood residuals

| Stage | Residual | State |
|---|---|---|
