/**
 * "Vendor tax template default ⓘ" (5zorro DF-02): why this bill's taxes are what they are, and
 * how to change it. ERPNext has no tax field on the vendor. A new purchase document takes its
 * taxes from a Tax Rule that names the vendor, else from the Purchase Taxes and Charges Template
 * marked Default (`get_party_details` → `set_taxes`). Tax Rules can also match by tax category or
 * address; this names only the vendor rule, which is the one a clerk sets up for one vendor.
 */

const enc = (v) => encodeURIComponent(String(v || ""));

/**
 * @param {{
 *   supplier?: string,
 *   current?: string,          // the template on this bill now (taxes_and_charges)
 *   defaultTemplate?: string,  // the template marked Default, if any
 *   vendorRule?: { name: string, template: string } | null,
 *   removed?: boolean,         // the clerk removed all taxes on this bill
 * }} f
 * @returns {{ lines: string[], links: { label: string, route: string }[] }}
 */
export function taxDefaultWhy(f = {}) {
  const vendor = String(f.supplier || "").trim();
  const lines = [];
  const links = [];
  const rule = f.vendorRule && f.vendorRule.name ? f.vendorRule : null;
  if (rule) {
    lines.push(`${vendor || "This vendor"} has its own Tax Rule (${rule.name}), so new bills from it start with ${rule.template || "that rule's template"}.`);
    links.push({ label: `Open Tax Rule ${rule.name}`, route: `/app/tax-rule/${enc(rule.name)}` });
    if (rule.template) links.push({ label: `Open ${rule.template}`, route: `/app/purchase-taxes-and-charges-template/${enc(rule.template)}` });
  } else if (f.defaultTemplate) {
    lines.push(`No Tax Rule names ${vendor || "this vendor"}, so new bills start with ${f.defaultTemplate}, the template marked Default.`);
    links.push({ label: `Open ${f.defaultTemplate} (untick Default to stop it)`, route: `/app/purchase-taxes-and-charges-template/${enc(f.defaultTemplate)}` });
  } else {
    lines.push(`No template is marked Default and no Tax Rule names ${vendor || "this vendor"}, so new bills start with no taxes.`);
  }
  if (!rule && vendor) {
    links.push({
      label: `Give ${vendor} its own default (new Tax Rule)`,
      route: `/app/tax-rule/new?tax_type=Purchase&supplier=${enc(vendor)}`,
    });
  }
  const expected = rule ? rule.template : f.defaultTemplate || "";
  if (f.removed) {
    lines.push("You removed all taxes on this bill; they stay removed until you save it.");
  } else if (f.current && f.current !== expected) {
    lines.push(`This bill uses ${f.current}, picked on the bill itself.`);
  }
  lines.push("Changing a rule or the Default affects new bills, not this one.");
  return { lines, links };
}
