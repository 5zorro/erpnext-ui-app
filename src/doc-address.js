/**
 * Profile-parameterized address roles + picker policy (tranche 6).
 * Bill = pickable Link fields on Purchase Invoice; PO = pickable with PO-specific ERP fields.
 */

import { formatUsAddressBlock } from "./address-format.js";

/** @typedef {"billing"|"ship_from"|"ship_to"} AddressRole */

/**
 * @typedef {{
 *   role: AddressRole,
 *   displayField: string,
 *   label: string,
 *   linkField?: string,
 *   party?: "supplier"|"company"|"customer",
 *   partyWhenCustomer?: "customer",
 *   title?: string,
 *   pickable: boolean,
 * }} AddressRoleMeta
 */

/** Purchase Invoice — OI-136 pickers (Bill). */
export const BILL_ADDRESS_ROLES = Object.freeze(
  /** @type {readonly AddressRoleMeta[]} */ ([
    {
      role: "billing",
      linkField: "supplier_address",
      displayField: "address_display",
      label: "Remittance & Billing Address",
      party: "supplier",
      title: "Pick remittance / billing address (Supplier Address)",
      pickable: true,
    },
    {
      role: "ship_from",
      linkField: "dispatch_address",
      displayField: "dispatch_address_display",
      label: "Ship from / supplier dispatch",
      party: "supplier",
      title: "Pick ship-from / supplier dispatch address",
      pickable: true,
    },
    {
      role: "ship_to",
      linkField: "shipping_address",
      displayField: "shipping_address_display",
      label: "Ship to / receiving address",
      party: "company",
      title: "Pick ship-to / receiving address (company or warehouse)",
      pickable: true,
    },
  ]),
);

/**
 * Purchase Order — OI-077 + drop-ship ship-to (customer addresses when Customer is set).
 */
export const PO_ADDRESS_ROLES = Object.freeze(
  /** @type {readonly AddressRoleMeta[]} */ ([
    {
      role: "billing",
      linkField: "billing_address",
      displayField: "billing_address_display",
      label: "Billing address",
      party: "company",
      title: "Pick company billing address",
      pickable: true,
    },
    {
      role: "ship_from",
      linkField: "supplier_address",
      displayField: "address_display",
      label: "Ship from",
      party: "supplier",
      title: "Pick supplier address (ship from)",
      pickable: true,
    },
    {
      role: "ship_to",
      linkField: "shipping_address",
      displayField: "shipping_address_display",
      label: "Ship to",
      party: "company",
      partyWhenCustomer: "customer",
      title: "Pick ship-to (company, warehouse, or customer when drop-shipping)",
      pickable: true,
    },
  ]),
);

/** Item Receipt — no address block in Doc skin. */
export const RECEIPT_ADDRESS_ROLES = Object.freeze(/** @type {readonly AddressRoleMeta[]} */ ([]));

/** @type {Record<string, readonly AddressRoleMeta[]>} */
const ROLES_BY_PROFILE = Object.freeze({
  bill: BILL_ADDRESS_ROLES,
  po: PO_ADDRESS_ROLES,
  receipt: RECEIPT_ADDRESS_ROLES,
});

/**
 * @param {string|null|undefined} profileId
 * @returns {readonly AddressRoleMeta[]}
 */
export function addressRolesForProfile(profileId) {
  const key = String(profileId || "").trim();
  return ROLES_BY_PROFILE[key] || Object.freeze([]);
}

/**
 * @param {string|null|undefined} profileId
 * @param {string} role
 * @returns {AddressRoleMeta|null}
 */
export function addressRoleMeta(profileId, role) {
  const key = String(role || "").trim();
  return addressRolesForProfile(profileId).find((r) => r.role === key) || null;
}

/**
 * Link fields a profile may write via address pickers.
 * @param {string|null|undefined} profileId
 * @returns {string[]}
 */
export function addressLinkFieldsForProfile(profileId) {
  return addressRolesForProfile(profileId)
    .filter((r) => r.pickable && r.linkField)
    .map((r) => /** @type {string} */ (r.linkField));
}

/**
 * @param {string|null|undefined} profileId
 * @param {string} field
 */
export function isAddressLinkField(profileId, field) {
  return addressLinkFieldsForProfile(profileId).includes(field);
}

/**
 * @param {object|null|undefined} row
 * @returns {{ name: string, headline: string, body: string, meta: string }}
 */
export function projectAddressPickerOption(row) {
  const r = row && typeof row === "object" ? row : {};
  const name = String(r.name || "").trim();
  const title = String(r.address_title || "").trim();
  const type = String(r.address_type || "").trim();
  const flags = [];
  if (r.is_primary_address) flags.push("Primary");
  if (r.is_shipping_address) flags.push("Shipping");
  if (type) flags.push(type);
  const body = formatUsAddressBlock({
    line1: r.address_line1,
    line2: r.address_line2,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    country: r.country,
  });
  const headline = title || name || "(unnamed address)";
  return {
    name,
    headline,
    body,
    meta: flags.join(" · "),
  };
}

/**
 * Whether the address picker can open for this doc + profile + role.
 * @param {object|null|undefined} doc
 * @param {string|null|undefined} profileId
 * @param {string} role
 * @param {{ editable?: boolean, lockedReason?: string }} [opts]
 */
export function addressPickerOpenDecision(doc, profileId, role, opts = {}) {
  if (!opts.editable) {
    return {
      open: false,
      reason: opts.lockedReason || "Document is not a draft — addresses locked.",
    };
  }
  const meta = addressRoleMeta(profileId, role);
  if (!meta) return { open: false, reason: "Unknown address role." };
  if (!meta.pickable || !meta.linkField) {
    return { open: false, reason: "Address picker not enabled for this field." };
  }
  const d = doc && typeof doc === "object" ? doc : {};
  if (meta.party === "supplier") {
    const sup = String(d.supplier || "").trim();
    if (!sup) return { open: false, reason: "Pick a vendor before choosing an address." };
  }
  if (meta.partyWhenCustomer === "customer") {
    const cust = String(d.customer || "").trim();
    const co = String(d.company || "").trim();
    if (!cust && !co) {
      return {
        open: false,
        reason: "Pick a customer (drop ship) or ensure company is set for ship-to.",
      };
    }
  } else if (meta.party === "company") {
    const co = String(d.company || "").trim();
    if (!co) return { open: false, reason: "Document has no company — cannot list receiving addresses." };
  }
  if (meta.party === "customer") {
    const cust = String(d.customer || "").trim();
    if (!cust) return { open: false, reason: "Pick a customer before choosing a ship-to address." };
  }
  return { open: true, reason: "", meta };
}

/**
 * Resolve address list party for ERP Address dynamic links.
 * @param {object|null|undefined} doc
 * @param {AddressRoleMeta} meta
 * @returns {{ partyDoctype: string, partyName: string }|null}
 */
export function addressListParty(doc, meta) {
  if (!meta) return null;
  const d = doc && typeof doc === "object" ? doc : {};
  if (meta.partyWhenCustomer === "customer") {
    const cust = String(d.customer || "").trim();
    if (cust) return { partyDoctype: "Customer", partyName: cust };
  }
  if (meta.party === "supplier") {
    const sup = String(d.supplier || "").trim();
    if (!sup) return null;
    return { partyDoctype: "Supplier", partyName: sup };
  }
  if (meta.party === "customer") {
    const cust = String(d.customer || "").trim();
    if (!cust) return null;
    return { partyDoctype: "Customer", partyName: cust };
  }
  if (meta.party === "company") {
    const co = String(d.company || "").trim();
    if (!co) return null;
    return { partyDoctype: "Company", partyName: co };
  }
  return null;
}

/**
 * @param {readonly AddressRoleMeta[]} roles
 * @returns {boolean}
 */
export function profileHasPickableAddresses(roles) {
  return roles.some((r) => r.pickable && r.linkField);
}
