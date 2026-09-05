/**
 * Maps unified erpDoc preload to the Bill page controller API (tranche 10).
 * @param {typeof window.erpDoc} api
 */
export function billApiFromErpDoc(api) {
  if (!api) throw new Error("Doc API missing");
  return {
    getSnapshot: () => api.getSnapshot(),
    setHeader: (field, value) => api.setHeader(field, value),
    checkRef: (billNo, opts) => api.checkRef(billNo, opts || {}),
    prefetchVendorRefs: (supplier) =>
      api.prefetchVendorRefs ? api.prefetchVendorRefs(supplier || "") : Promise.resolve({ ok: false }),
    setAmountDue: (value, markEdited) => api.setAmountDue(value, !!markEdited),
    setItem: (rowIndex, field, value) => api.setItem(rowIndex, field, value),
    addItem: () => api.addItem(),
    deleteItem: (rowIndex) => api.deleteItem(rowIndex),
    clearAllQty: () => api.clearAllQty(),
    setTax: (rowIndex, field, value) => api.setTax(rowIndex, field, value),
    addTax: (accountHead, taxAmount, description) =>
      api.addTax(accountHead, taxAmount, description || ""),
    deleteTax: (rowIndex) => api.deleteTax(rowIndex),
    listPayments: () => api.listPayments(),
    openAddPayment: () => api.openAddPayment(),
    listAddresses: (role) => api.listAddresses(role || ""),
    allocateCharge: (taxRowIndex, mode, custom) =>
      api.allocateCharge(taxRowIndex, mode || "amount", custom || []),
    openLandedCost: () => api.openLandedCost(),
    attachFile: () => api.attachFile(),
    save: (opts) => api.save(opts || {}),
    listMandatory: () => api.listMandatory(),
    revertUnsaved: () => api.revertUnsaved(),
    findBills: (prefill) => api.findDocs(prefill || {}),
    refocusListFilter: (fieldname) => api.refocusListFilter(fieldname || "bill_no"),
    newBill: () => api.newDoc(),
    printBill: () => api.printDoc(),
    searchLink: (doctype, txt) => api.searchLink(doctype, txt || ""),
    checkAccountCompanies: () => api.checkAccountCompanies(),
    listSources: (supplier) => api.listSources(supplier || ""),
    listSourceSlice: (supplier, sliceId) =>
      api.listSourceSlice ? api.listSourceSlice(supplier || "", sliceId || "") : Promise.resolve({ ok: false }),
    fetchSourceTerms: (refs) => api.fetchSourceTerms(refs || []),
    mergeSource: (kindOrItems, name) => api.mergeSource(kindOrItems, name),
    listSalesOrdersForPicker: (payload) => api.listSalesOrdersForPicker(payload || {}),
    listProjectsForPicker: (customer) => api.listProjectsForPicker(customer || ""),
    applyLineAllocation: (rowIndex, payload) =>
      api.applyLineAllocation(rowIndex, payload || {}),
    bridgeSalesOrderToPo: (payload) => api.bridgeSalesOrderToPo(payload || {}),
    retryLoad: () => api.retryLoad(),
    openVanilla: () => api.openVanilla(),
    openVendorAdd: () => api.openVendorAdd(),
    openSupplierForm: (supplier) => api.openSupplierForm(supplier || ""),
    openProjectAdd: () => api.openProjectAdd(),
    openPaymentTermsAdd: () => api.openPaymentTermsAdd(),
    focusBillSurface: () => api.focusSurface(),
    appendCalcHistory: (entry) => api.appendCalcHistory(entry || {}),
    getCalcHistory: () => api.getCalcHistory(),
    copyCalcHistory: (id, mode) => api.copyCalcHistory(id, mode || "table"),
    onSnapshot: (cb) => api.onSnapshot(cb),
    onOpenNavGate: (cb) => api.onOpenNavGate(cb),
    onCancelNavGate: (cb) => api.onCancelNavGate(cb),
    resolveNavGate: (token, proceed) => api.resolveNavGate(token, !!proceed),
    softPeekRoute: (route) => api.softPeekRoute(route || ""),
    logNav: (event, detail) =>
      api.logNav ? api.logNav(event, detail) : undefined,
  };
}
