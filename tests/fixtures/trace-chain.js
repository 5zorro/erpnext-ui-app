/**
 * A hand-built trace chain in `/api/resource` shape — the mockup's worked example
 * (docs/mockups/bowtie-trace.html) as ERPNext would store it: row ids on every line, the link
 * fields ERPNext sets when a document is made from another, and the bill's freight already spread
 * into `item_tax_amount` the way buying_controller.update_valuation_rate does (by net amount,
 * stock lines only when "allocate full amount to stock items" is set).
 *
 * Every number is chosen so a test can say what it should be without a calculator:
 *   freight 30.00 over stock lines 400 + 150 + 240 + 45 = 835 → 14.37 / 5.39 / 8.62 / 1.62
 *   (rounding remainder on the last stock line); the pallet wrap is non-stock and gets none.
 */

const doc = (doctype, name, extra) => ({ doctype, name, docstatus: 1, creation: `${extra.posting_date || extra.transaction_date} 09:00:00`, ...extra });

export function traceChain() {
  return [
    doc("Quotation", "SAL-QTN-0608", { transaction_date: "2026-08-02", party_name: "CUST-BT", items: [
      { name: "q1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 150, amount: 600, base_net_amount: 600 },
      { name: "q2", idx: 2, item_code: "SKU-BOWTIE-B", qty: 2, rate: 200, amount: 400, base_net_amount: 400 },
    ] }),
    doc("Sales Order", "SAL-ORD-0543", { transaction_date: "2026-08-06", customer: "CUST-BT", po_no: "Cust PO 7781", items: [
      { name: "s1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 150, amount: 600, base_net_amount: 600, prevdoc_docname: "SAL-QTN-0608", quotation_item: "q1" },
      { name: "s2", idx: 2, item_code: "SKU-BOWTIE-B", qty: 2, rate: 200, amount: 400, base_net_amount: 400, prevdoc_docname: "SAL-QTN-0608", quotation_item: "q2" },
    ] }),
    // Stock, raised in the warehouse: rides on the customer's PO / receipt / bill, never joins its story.
    doc("Material Request", "MAT-MR-0031", { transaction_date: "2026-08-08", items: [
      { name: "m1", idx: 1, item_code: "SKU-BOWTIE-D", qty: 5, rate: 30, amount: 150, base_net_amount: 150 },
    ] }),
    doc("Purchase Order", "PUR-ORD-0404", { transaction_date: "2026-08-10", supplier: "SUP-BT", items: [
      { name: "p1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 100, amount: 400, base_net_amount: 400, sales_order: "SAL-ORD-0543", sales_order_item: "s1" },
      { name: "p2", idx: 2, item_code: "SKU-BOWTIE-D", qty: 5, rate: 30, amount: 150, base_net_amount: 150, material_request: "MAT-MR-0031", material_request_item: "m1" },
    ] }),
    // SKU-BOWTIE-C names the Sales Order (typed into the line), but the order has no such item.
    doc("Purchase Order", "PUR-ORD-0405", { transaction_date: "2026-08-11", supplier: "SUP-BT", items: [
      { name: "p3", idx: 1, item_code: "SKU-BOWTIE-B", qty: 2, rate: 120, amount: 240, base_net_amount: 240, sales_order: "SAL-ORD-0543", sales_order_item: "s2" },
      { name: "p4", idx: 2, item_code: "SKU-BOWTIE-C", qty: 1, rate: 45, amount: 45, base_net_amount: 45, sales_order: "SAL-ORD-0543" },
    ] }),
    doc("Purchase Receipt", "MAT-PRE-0211", { posting_date: "2026-08-18", supplier: "SUP-BT", supplier_delivery_note: "PS-5521", items: [
      { name: "r1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 100, amount: 400, base_net_amount: 400, purchase_order: "PUR-ORD-0404", purchase_order_item: "p1", sales_order: "SAL-ORD-0543", sales_order_item: "s1" },
      { name: "r2", idx: 2, item_code: "SKU-BOWTIE-D", qty: 5, rate: 30, amount: 150, base_net_amount: 150, purchase_order: "PUR-ORD-0404", purchase_order_item: "p2", material_request: "MAT-MR-0031", material_request_item: "m1" },
    ] }),
    // Arrived the day after the vendor dated the bill: an out-of-order link.
    doc("Purchase Receipt", "MAT-PRE-0212", { posting_date: "2026-08-21", supplier: "SUP-BT", supplier_delivery_note: "PS-5534", items: [
      { name: "r3", idx: 1, item_code: "SKU-BOWTIE-B", qty: 2, rate: 120, amount: 240, base_net_amount: 240, purchase_order: "PUR-ORD-0405", purchase_order_item: "p3" },
      { name: "r4", idx: 2, item_code: "SKU-BOWTIE-C", qty: 1, rate: 45, amount: 45, base_net_amount: 45, purchase_order: "PUR-ORD-0405", purchase_order_item: "p4" },
    ] }),
    doc("Purchase Invoice", "ACC-PINV-0268", {
      posting_date: "2026-08-22", bill_date: "2026-08-20", due_date: "2026-09-19", supplier: "SUP-BT", bill_no: "BT-24490",
      grand_total: 900, base_grand_total: 900, outstanding_amount: 0,
      items: [
        { name: "b1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 100, amount: 400, base_net_amount: 400, purchase_receipt: "MAT-PRE-0211", pr_detail: "r1", purchase_order: "PUR-ORD-0404", po_detail: "p1", item_tax_amount: 14.37 },
        { name: "b2", idx: 2, item_code: "SKU-BOWTIE-D", qty: 5, rate: 30, amount: 150, base_net_amount: 150, purchase_receipt: "MAT-PRE-0211", pr_detail: "r2", purchase_order: "PUR-ORD-0404", po_detail: "p2", item_tax_amount: 5.39 },
        { name: "b3", idx: 3, item_code: "SKU-BOWTIE-B", qty: 2, rate: 120, amount: 240, base_net_amount: 240, purchase_receipt: "MAT-PRE-0212", pr_detail: "r3", purchase_order: "PUR-ORD-0405", po_detail: "p3", item_tax_amount: 8.62 },
        { name: "b4", idx: 4, item_code: "SKU-BOWTIE-C", qty: 1, rate: 45, amount: 45, base_net_amount: 45, purchase_receipt: "MAT-PRE-0212", pr_detail: "r4", purchase_order: "PUR-ORD-0405", po_detail: "p4", item_tax_amount: 1.62 },
        { name: "b5", idx: 5, item_code: "PALLET-WRAP", qty: 1, rate: 20, amount: 20, base_net_amount: 20, item_tax_amount: 0 },
      ],
      taxes: [
        { category: "Valuation and Total", charge_type: "Actual", add_deduct_tax: "Add", description: "Freight", tax_amount: 30, base_tax_amount_after_discount_amount: 30 },
        { category: "Total", charge_type: "Actual", add_deduct_tax: "Add", description: "Fuel surcharge", tax_amount: 15, base_tax_amount_after_discount_amount: 15 },
      ],
    }),
    // The vendor credits back the item that was never on the Sales Order.
    doc("Purchase Invoice", "ACC-PINV-0273", {
      posting_date: "2026-09-03", bill_date: "2026-09-02", supplier: "SUP-BT", bill_no: "BT-CM-091", is_return: 1, return_against: "ACC-PINV-0268",
      grand_total: -45, base_grand_total: -45, outstanding_amount: -45,
      items: [{ name: "c1", idx: 1, item_code: "SKU-BOWTIE-C", qty: -1, rate: 45, amount: -45, base_net_amount: -45, purchase_invoice_item: "b4" }],
    }),
    // A check that also paid two bills not fetched here.
    doc("Payment Entry", "ACC-PAY-0004", {
      posting_date: "2026-08-28", reference_date: "2026-08-27", reference_no: "Check 10452", clearance_date: "2026-09-03",
      payment_type: "Pay", party_type: "Supplier", party: "SUP-BT", paid_amount: 5000,
      references: [
        { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-0268", allocated_amount: 900 },
        { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-0255", allocated_amount: 2100 },
        { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-0261", allocated_amount: 2000 },
      ],
    }),
    doc("Sales Invoice", "ACC-SINV-0525", { posting_date: "2026-09-01", customer: "CUST-BT", grand_total: 1000, base_grand_total: 1000, items: [
      { name: "i1", idx: 1, item_code: "SKU-BOWTIE", qty: 4, rate: 150, amount: 600, base_net_amount: 600, sales_order: "SAL-ORD-0543", so_detail: "s1" },
      { name: "i2", idx: 2, item_code: "SKU-BOWTIE-B", qty: 2, rate: 200, amount: 400, base_net_amount: 400, sales_order: "SAL-ORD-0543", so_detail: "s2" },
    ] }),
    doc("Payment Entry", "ACC-PAY-0005", {
      posting_date: "2026-09-15", reference_date: "2026-09-12", reference_no: "Check 3318", payment_type: "Receive", party_type: "Customer", party: "CUST-BT", paid_amount: 1000,
      references: [{ reference_doctype: "Sales Invoice", reference_name: "ACC-SINV-0525", allocated_amount: 1000 }],
    }),
  ];
}
