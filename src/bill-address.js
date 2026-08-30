/**
 * Bill address pickers — thin re-exports over doc-address (Purchase Invoice profile).
 * @deprecated Import from doc-address.js for new code; these aliases keep Bill IPC/tests stable.
 */

import {
  BILL_ADDRESS_ROLES,
  addressRoleMeta,
  addressLinkFieldsForProfile,
  isAddressLinkField,
  projectAddressPickerOption,
  addressPickerOpenDecision as docAddressPickerOpenDecision,
} from "./doc-address.js";

export {
  BILL_ADDRESS_ROLES,
  projectAddressPickerOption,
};

/** @typedef {import("./doc-address.js").AddressRole} BillAddressRole */
/** @typedef {import("./doc-address.js").AddressRoleMeta} BillAddressRoleMeta */

/**
 * @param {string} role
 * @returns {import("./doc-address.js").AddressRoleMeta|null}
 */
export function billAddressRoleMeta(role) {
  return addressRoleMeta("bill", role);
}

/** @returns {string[]} */
export function billAddressLinkFields() {
  return addressLinkFieldsForProfile("bill");
}

/** @param {string} field */
export function isBillAddressLinkField(field) {
  return isAddressLinkField("bill", field);
}

/**
 * @param {object|null|undefined} doc
 * @param {string} role
 * @param {{ editable?: boolean }} [opts]
 */
export function addressPickerOpenDecision(doc, role, opts = {}) {
  return docAddressPickerOpenDecision(doc, "bill", role, {
    ...opts,
    lockedReason: "Bill is not a draft — addresses locked.",
  });
}
