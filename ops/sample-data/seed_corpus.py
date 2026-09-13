#!/usr/bin/env python3
"""
Apply ui-app sample corpus plan inside a Frappe bench (sandbox only).

Invoked by ops/sample-data/run-seed.sh via:
  bench --site <site> execute seed_corpus.run --kwargs '{...}'

Clean Core: lives beside the shell, never patched into apps/erpnext.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import frappe
from frappe.utils import add_days, cint, flt, getdate, nowdate

# A5: ERPNext's OWN due-date arithmetic. `validate_due_date_with_template` throws unless the
# document's due_date matches what this returns, so re-deriving it here (rather than
# reimplementing "posting + credit_days") is what keeps a Net 15 or a "Net 10th" term valid.
from erpnext.accounts.party import get_due_date_from_template


TAG_FIELD_HINT = "ui-app-sample"  # substring used in title/remarks


def _tag_title(tag: str, key: str) -> str:
    return f"{tag}:{key}"


def _remarks(tag: str, key: str) -> str:
    return f"[{tag}] {key}"


def _find_existing(dt: str, tag: str, key: str) -> str | None:
    meta = frappe.get_meta(dt)
    if meta.has_field("remarks"):
        found = frappe.db.get_value(dt, {"remarks": _remarks(tag, key)}, "name")
        if found:
            return found
    if meta.has_field("title"):
        found = frappe.db.get_value(dt, {"title": _tag_title(tag, key)}, "name")
        if found:
            return found
    return None


def _apply_tag_fields(doc, tag: str, key: str) -> None:
    remarks = _remarks(tag, key)
    title = _tag_title(tag, key)
    meta = doc.meta
    if meta.has_field("remarks"):
        doc.remarks = remarks
    if meta.has_field("title"):
        doc.title = title


def run(plan_path: str | None = None, reset: int | bool = 0, as_of: str | None = None) -> dict[str, Any]:
    """Entry point for `bench execute seed_corpus.run`."""
    plan_path = plan_path or os.environ.get("SAMPLE_PLAN_PATH", "/tmp/corpus-plan.json")
    with open(plan_path, encoding="utf-8") as fh:
        plan = json.load(fh)

    company = _resolve_company()
    _assert_sandbox(company)

    tag = plan.get("tag") or "ui-app-sample-v2"
    as_of = as_of or plan.get("asOf") or nowdate()
    warehouse = _default_warehouse(company)

    _ensure_fiscal_years(as_of)

    if cint(reset):
        deleted = _reset_tagged(tag)
        frappe.db.commit()
        print(f"reset: deleted {deleted} tagged docs")

    _ensure_modes_of_payment(plan)
    terms_map = _ensure_payment_terms(plan)

    tax_ctx = _ensure_tax_masters(company, plan)
    party_map = _ensure_masters(plan["parties"], company, warehouse, tag, tax_ctx, terms_map)
    name_map: dict[str, str] = {}  # plan key -> ERP name

    # Apply in dependency order
    order = [
        "quotation",
        "sales_order",
        "sales_invoice",
        "purchase_order",
        "purchase_receipt",
        "purchase_invoice",
    ]
    created: dict[str, list[str]] = {k: [] for k in order}

    by_kind: dict[str, list[dict]] = {k: [] for k in order}
    for doc in plan["docs"]:
        by_kind[doc["kind"]].append(doc)

    for kind in order:
        for spec in by_kind[kind]:
            posting = spec.get("postingDate") or _date_for_offset(as_of, spec["dayOffset"])
            erp_name = _create_one(
                kind, spec, plan, party_map, name_map, company, warehouse, tag, posting, as_of
            )
            name_map[spec["key"]] = erp_name
            created[kind].append(erp_name)
            frappe.db.commit()

    summary = {k: len(v) for k, v in created.items()}
    print(json.dumps({"ok": True, "company": company, "created": summary, "tag": tag}, indent=2))
    return {"ok": True, "created": created, "summary": summary, "company": company}


def _resolve_company() -> str:
    override = os.environ.get("SAMPLE_COMPANY")
    if override:
        return override
    # Prefer a SANDBOX-named company when several exist
    names = frappe.get_all("Company", pluck="name")
    for n in names:
        if "SANDBOX" in n.upper() and "(Demo)" not in n:
            return n
    if len(names) == 1:
        return names[0]
    default = frappe.db.get_single_value("Global Defaults", "default_company")
    if default:
        return default
    raise frappe.ValidationError(f"Cannot resolve company from {names}")


def _assert_sandbox(company: str) -> None:
    site = getattr(frappe.local, "site", "") or ""
    force = os.environ.get("SAMPLE_DATA_FORCE") == "1"
    if force:
        print("WARNING: SAMPLE_DATA_FORCE=1 — sandbox checks bypassed")
        return
    site_ok = site in {"frontend"} or "sandbox" in site.lower()
    company_ok = "sandbox" in company.lower()
    if not (site_ok and company_ok):
        raise frappe.ValidationError(
            f"Refusing sample seed: site={site!r} company={company!r} "
            "(need allowlisted sandbox; set SAMPLE_DATA_FORCE=1 only in emergencies)"
        )


def _default_warehouse(company: str) -> str:
    wh = frappe.db.get_value(
        "Warehouse",
        {"company": company, "is_group": 0, "warehouse_name": ("like", "Stores%")},
        "name",
    )
    if not wh:
        wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
    if not wh:
        raise frappe.ValidationError(f"No warehouse for {company}")
    return wh


def _date_for_offset(as_of: str, day_offset: int) -> str:
    return str(add_days(getdate(as_of), -cint(day_offset)))


def _company_abbr(company: str) -> str:
    return frappe.db.get_value("Company", company, "abbr") or "HI"


def _ensure_fiscal_years(as_of: str) -> None:
    """Ensure calendar FY rows exist for as_of year and prior year (OI-131 idle PO)."""
    anchor = getdate(as_of)
    for y in (anchor.year - 1, anchor.year):
        name = str(y)
        if frappe.db.exists("Fiscal Year", name):
            continue
        doc = frappe.get_doc(
            {
                "doctype": "Fiscal Year",
                "year": name,
                "year_start_date": f"{y}-01-01",
                "year_end_date": f"{y}-12-31",
            }
        )
        doc.insert(ignore_permissions=True)
        print(f"created Fiscal Year {name}")


def _ensure_tax_masters(company: str, plan: dict) -> dict[str, str]:
    """
    Ensure sales-tax template + SAMPLE-TDS withholding category/account.
    Returns {sales_tax_template, tds_category, tds_account}.
    """
    abbr = _company_abbr(company)
    tax_plan = plan.get("tax") or {}
    tds_name = tax_plan.get("tdsCategory") or "SAMPLE-TDS"

    sales_template = _ensure_sales_tax_template(company, abbr)
    tds_account = _ensure_tds_payable_account(company, abbr)
    _ensure_tax_withholding_category(tds_name, company, tds_account)

    frappe.db.commit()
    print(
        json.dumps(
            {
                "tax_masters": {
                    "sales_tax_template": sales_template,
                    "tds_category": tds_name,
                    "tds_account": tds_account,
                }
            }
        )
    )
    return {
        "sales_tax_template": sales_template,
        "tds_category": tds_name,
        "tds_account": tds_account,
    }


def _ensure_sales_tax_template(company: str, abbr: str) -> str:
    """Prefer existing US ST 6.25%; else create SAMPLE UT ST 7.25%."""
    preferred = [
        f"US ST 6.25% - {abbr}",
        f"US ST 6% - {abbr}",
        f"US ST 4% - {abbr}",
    ]
    for name in preferred:
        if frappe.db.exists("Sales Taxes and Charges Template", name):
            return name

    # Create 7.25% SAMPLE template + liability account when stock US templates missing.
    acct = _ensure_tax_liability_account(company, abbr, f"ST 7.25% - {abbr}", "Sales Tax 7.25%")
    tmpl_name = f"SAMPLE UT ST 7.25% - {abbr}"
    if not frappe.db.exists("Sales Taxes and Charges Template", tmpl_name):
        frappe.get_doc(
            {
                "doctype": "Sales Taxes and Charges Template",
                "title": "SAMPLE UT ST 7.25%",
                "company": company,
                "taxes": [
                    {
                        "charge_type": "On Net Total",
                        "account_head": acct,
                        "description": "SAMPLE UT sales tax 7.25%",
                        "rate": 7.25,
                    }
                ],
            }
        ).insert(ignore_permissions=True)
    return tmpl_name


def _ensure_tax_liability_account(company: str, abbr: str, name: str, account_name: str) -> str:
    if frappe.db.exists("Account", name):
        return name
    parent = frappe.db.get_value(
        "Account",
        {"company": company, "account_name": ("like", "Duties and Taxes%"), "is_group": 1},
        "name",
    ) or frappe.db.get_value(
        "Account",
        {"company": company, "name": ("like", f"Duties and Taxes%"), "is_group": 1},
        "name",
    )
    if not parent:
        raise frappe.ValidationError(f"No Duties and Taxes group for {company}")
    doc = frappe.get_doc(
        {
            "doctype": "Account",
            "account_name": account_name,
            "company": company,
            "parent_account": parent,
            "is_group": 0,
            "account_type": "Tax",
            "root_type": "Liability",
            "report_type": "Balance Sheet",
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_tds_payable_account(company: str, abbr: str) -> str:
    name = f"TDS Payable - {abbr}"
    if frappe.db.exists("Account", name):
        return name
    return _ensure_tax_liability_account(company, abbr, name, "TDS Payable")


def _ensure_tax_withholding_category(tds_name: str, company: str, tds_account: str) -> str:
    fy = frappe.db.get_value(
        "Fiscal Year",
        {"disabled": 0},
        ["name", "year_start_date", "year_end_date"],
        as_dict=True,
    )
    if not fy:
        raise frappe.ValidationError("No open Fiscal Year for tax withholding rates")

    if frappe.db.exists("Tax Withholding Category", tds_name):
        doc = frappe.get_doc("Tax Withholding Category", tds_name)
        # Ensure company account row exists
        if not any(r.company == company for r in (doc.accounts or [])):
            doc.append("accounts", {"company": company, "account": tds_account})
            doc.save(ignore_permissions=True)
        return tds_name

    doc = frappe.get_doc(
        {
            "doctype": "Tax Withholding Category",
            "name": tds_name,
            "category_name": "SAMPLE Tax Withholding (dogfood)",
            "rates": [
                {
                    "from_date": fy.year_start_date,
                    "to_date": fy.year_end_date,
                    "tax_withholding_rate": 10,
                    # Low thresholds so small SAMPLE invoices always withhold.
                    "single_threshold": 0,
                    "cumulative_threshold": 0,
                }
            ],
            "accounts": [{"company": company, "account": tds_account}],
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_modes_of_payment(plan: dict) -> None:
    """Create the rail-named Modes of Payment the cost model keys off.

    ERPNext ships Bank Draft / Cash / Check / Credit Card / Wire Transfer, none of which
    distinguish an ACH push from a domestic wire — a $0.40 vs $25 difference the whole batching
    comparison turns on. Idempotent: existing records are left alone.
    """
    for m in plan.get("modesOfPayment") or []:
        name = m["name"]
        if frappe.db.exists("Mode of Payment", name):
            continue
        frappe.get_doc(
            {
                "doctype": "Mode of Payment",
                "mode_of_payment": name,
                "type": m.get("type") or "Bank",
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        print(f"created Mode of Payment {name}")


def _ensure_payment_terms(plan: dict) -> dict[str, str]:
    """Create each Payment Term and the single-row Template that wraps it.

    A Supplier can only link a Payment Terms Template, never a bare Payment Term, so every term
    gets a same-named one-row template. Returns plan key -> template name.

    The template row carries its own explicit copy of every field on purpose: ERPNext's
    `get_payment_terms` reads the TEMPLATE DETAIL row (not the Payment Term master) when building a
    bill's payment_schedule, and the detail's `fetch_from` only fires client-side. Setting both is
    what makes these values actually reach a bill created server-side.
    """
    out: dict[str, str] = {}
    for t in plan.get("paymentTerms") or []:
        name = t["name"]
        fields = {
            "invoice_portion": 100,
            "mode_of_payment": t.get("modeOfPayment"),
            "due_date_based_on": t.get("dueDateBasedOn") or "Day(s) after invoice date",
            "credit_days": int(t.get("creditDays") or 0),
            "credit_months": int(t.get("creditMonths") or 0),
            "description": t.get("description") or "",
        }
        if t.get("discount"):
            fields.update(
                {
                    "discount_type": t.get("discountType") or "Percentage",
                    "discount": float(t["discount"]),
                    "discount_validity_based_on": t.get("discountValidityBasedOn")
                    or "Day(s) after invoice date",
                    "discount_validity": int(t.get("discountValidity") or 0),
                }
            )

        # RECONCILE, don't just create. A create-only "ensure" silently keeps stale masters:
        # on 2026-09-09 the grace fold changed every creditDays (Net 30 +16 became a 46-day term)
        # and a re-seed rebuilt every bill against the OLD 30-day records, because the terms
        # already existed by name. The plan is the SSoT; an existing record gets corrected.
        if frappe.db.exists("Payment Term", name):
            term = frappe.get_doc("Payment Term", name)
            changed = [f for f, v in fields.items() if (term.get(f) or None) != (v or None)]
            if changed:
                term.update(fields)
                term.save(ignore_permissions=True)
                print(f"updated Payment Term {name} ({', '.join(changed)})")
        else:
            frappe.get_doc(
                {"doctype": "Payment Term", "payment_term_name": name, **fields}
            ).insert(ignore_permissions=True)
            print(f"created Payment Term {name}")

        # The template detail row is what `get_payment_terms` actually reads when building a
        # bill's schedule, so it has to be reconciled too — correcting only the master would
        # leave the number that matters untouched.
        if frappe.db.exists("Payment Terms Template", name):
            tmpl = frappe.get_doc("Payment Terms Template", name)
            row = tmpl.terms[0] if tmpl.terms else None
            if not row or any((row.get(f) or None) != (v or None) for f, v in fields.items()):
                tmpl.set("terms", [{"payment_term": name, **fields}])
                tmpl.save(ignore_permissions=True)
                print(f"updated Payment Terms Template {name}")
        else:
            frappe.get_doc(
                {
                    "doctype": "Payment Terms Template",
                    "template_name": name,
                    "terms": [{"payment_term": name, **fields}],
                }
            ).insert(ignore_permissions=True)
            print(f"created Payment Terms Template {name}")
        out[t["key"]] = name
    return out


def _purge_ap(company: str) -> int:
    """Cancel + delete EVERY AP document for `company`, tagged or not.

    `_reset_tagged` only removes docs carrying the sample tag, which is useless against a sandbox
    whose documents predate tagging (2026-09-09: 148 Purchase Invoices, 98 Purchase Receipts, zero
    tagged). This is the blunt instrument — deliberately company-scoped, and guarded by the same
    sandbox assertion as the seeder.

    Order matters: a Payment Entry references an invoice, an invoice references a receipt, a
    receipt references an order. Cancel dependents before parents or ERPNext refuses the delete.
    """
    doctypes = ["Payment Entry", "Purchase Invoice", "Purchase Receipt", "Purchase Order"]
    deleted = 0
    for dt in doctypes:
        names = frappe.get_all(dt, filters={"company": company}, pluck="name")
        for name in names:
            try:
                doc = frappe.get_doc(dt, name)
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc(dt, name, force=1, ignore_permissions=True)
                deleted += 1
            except Exception as exc:
                print(f"warn: could not delete {dt} {name}: {exc}")
        frappe.db.commit()
        print(f"purge: {dt} — {len(names)} seen")
    return deleted


def _sandbox_companies() -> list[str]:
    """EVERY sandbox-named company, not just the one the seeder writes to.

    `_resolve_company` deliberately skips "… (Demo)" so the seed never lands on it. That is right
    for writing and wrong for purging: on 2026-09-09 a purge scoped to the resolved company left
    56 Purchase Invoices, 28 Purchase Orders and 4 Purchase Receipts untouched on
    "HECSANDBOX INCORPORATED (Demo)" — including every hand-made ALPINE SUPPLY document the purge
    was asked to remove. Each name still has to pass `_assert_sandbox`.
    """
    override = os.environ.get("SAMPLE_COMPANY")
    if override:
        return [override]
    names = [n for n in frappe.get_all("Company", pluck="name") if "sandbox" in n.lower()]
    return names or [_resolve_company()]


def purge_ap() -> dict[str, Any]:
    """`bench execute` entry point for the AP purge alone (no reseed).

    Covers every sandbox company — see `_sandbox_companies` for why scoping this to the seed's
    own company silently leaves half the sandbox in place.
    """
    per_company: dict[str, int] = {}
    for company in _sandbox_companies():
        _assert_sandbox(company)
        per_company[company] = _purge_ap(company)
        frappe.db.commit()
        print(f"purge: deleted {per_company[company]} AP docs for {company}")
    total = sum(per_company.values())
    print(f"purge: {total} AP docs deleted across {len(per_company)} company/companies")
    return {"companies": per_company, "deleted": total}


def _ensure_masters(
    parties: dict,
    company: str,
    warehouse: str,
    tag: str,
    tax_ctx: dict | None = None,
    terms_map: dict[str, str] | None = None,
) -> dict[str, dict[str, str]]:
    """Return maps: suppliers/customers/items keyed by plan key → ERP name/code."""
    tax_ctx = tax_ctx or {}
    terms_map = terms_map or {}
    out = {"suppliers": {}, "customers": {}, "items": {}, "projects": {}}
    sales_tmpl = tax_ctx.get("sales_tax_template") or ""
    tds_cat = tax_ctx.get("tds_category") or "SAMPLE-TDS"

    for s in parties["suppliers"]:
        name = s["name"]
        if not frappe.db.exists("Supplier", name):
            doc = frappe.get_doc(
                {
                    "doctype": "Supplier",
                    "supplier_name": name,
                    "supplier_group": _first_or_create_group("Supplier Group", "All Supplier Groups", "Local"),
                    "supplier_type": "Company",
                }
            )
            doc.insert(ignore_permissions=True)
        else:
            doc = frappe.get_doc("Supplier", name)
        # A5: the Supplier's default terms. This only SEEDS a new bill — the bill's own
        # payment_terms_template is what actually builds its payment_schedule.
        s_tmpl = terms_map.get(s.get("paymentTermsKey") or "")
        if s_tmpl and doc.payment_terms != s_tmpl:
            doc.payment_terms = s_tmpl
            doc.save(ignore_permissions=True)
        if s.get("taxWithholding") and frappe.db.exists("Tax Withholding Category", tds_cat):
            if doc.tax_withholding_category != tds_cat:
                doc.tax_withholding_category = tds_cat
                doc.save(ignore_permissions=True)
        elif not s.get("taxWithholding") and doc.tax_withholding_category == tds_cat:
            doc.tax_withholding_category = None
            doc.save(ignore_permissions=True)
        # OI-087: vendor account # (what they call us) for Ref sandwich checks.
        acct = (s.get("accountNumber") or "").strip()
        if acct:
            existing_nums = {
                (r.customer_number or "").strip()
                for r in (doc.customer_numbers or [])
            }
            if acct not in existing_nums:
                doc.append(
                    "customer_numbers",
                    {"company": company, "customer_number": acct},
                )
                doc.save(ignore_permissions=True)
        out["suppliers"][s["key"]] = name

    for c in parties["customers"]:
        name = c["name"]
        if not frappe.db.exists("Customer", name):
            doc = frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": name,
                    "customer_group": _first_or_create_group("Customer Group", "All Customer Groups", "Commercial"),
                    "territory": _first_or_create_group("Territory", "All Territories", "United States"),
                    "customer_type": "Company",
                }
            )
            doc.insert(ignore_permissions=True)
        else:
            doc = frappe.get_doc("Customer", name)
        # OI-115: taxable vs exempt
        want_exempt = not c.get("taxable", True)
        if cint(getattr(doc, "exempt_from_sales_tax", 0)) != cint(want_exempt):
            doc.exempt_from_sales_tax = 1 if want_exempt else 0
            doc.save(ignore_permissions=True)
        out["customers"][c["key"]] = name

    for it in parties["items"]:
        code = it["code"]
        if not frappe.db.exists("Item", code):
            doc = frappe.get_doc(
                {
                    "doctype": "Item",
                    "item_code": code,
                    "item_name": it["name"],
                    "item_group": _first_or_create_group("Item Group", "All Item Groups", "Products"),
                    "stock_uom": "Nos",
                    "is_stock_item": 1,
                    "is_purchase_item": 1,
                    "is_sales_item": 1,
                    "include_item_in_manufacturing": 0,
                    "valuation_rate": flt(it.get("rate") or 10),
                    "standard_rate": flt(it.get("rate") or 10),
                    "description": f"[{tag}] {it['name']}",
                }
            )
            doc.insert(ignore_permissions=True)
            # Opening stock optional — invoices use update_stock=0; PR will value from item master
            _ensure_bin_qty(code, warehouse, 500, rate=flt(it.get("rate") or 10))
        out["items"][it["key"]] = code

    for p in parties.get("projects") or []:
        name = p["name"]
        cust_key = p.get("customerKey")
        customer = out["customers"].get(cust_key) if cust_key else None
        erp_name = frappe.db.get_value("Project", {"project_name": name}, "name")
        if not erp_name and frappe.db.exists("Project", name):
            erp_name = name
        if not erp_name:
            doc = frappe.get_doc(
                {
                    "doctype": "Project",
                    "project_name": name,
                    "customer": customer,
                    "status": "Open",
                }
            )
            doc.insert(ignore_permissions=True)
            erp_name = doc.name
        else:
            doc = frappe.get_doc("Project", erp_name)
            if customer and doc.customer != customer:
                doc.customer = customer
                doc.save(ignore_permissions=True)
        out["projects"][p["key"]] = erp_name

    frappe.db.commit()
    # Stash template on party_map via side channel for _create_one
    out["_tax"] = {"sales_tax_template": sales_tmpl, "tds_category": tds_cat}
    return out


def _first_or_create_group(doctype: str, root_name: str, child_name: str) -> str:
    """Pick an existing group leaf (or root). Do not invent chart nodes."""
    for candidate in (child_name, root_name):
        found = frappe.db.exists(doctype, candidate)
        if found:
            return found
    leaf = frappe.db.get_value(doctype, {"is_group": 0}, "name")
    if leaf:
        return leaf
    any_row = frappe.db.get_value(doctype, {}, "name")
    if any_row:
        return any_row
    raise frappe.ValidationError(f"No {doctype} found for masters")


def _ensure_bin_qty(item_code: str, warehouse: str, qty: float, rate: float = 10) -> None:
    """Best-effort opening qty. Seed uses update_stock=0 on invoices, so this is optional."""
    bal = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty") or 0
    if flt(bal) >= qty:
        return
    try:
        se = frappe.get_doc(
            {
                "doctype": "Stock Entry",
                "stock_entry_type": "Material Receipt",
                "purpose": "Material Receipt",
                "company": frappe.db.get_value("Warehouse", warehouse, "company"),
                "items": [
                    {
                        "item_code": item_code,
                        "qty": qty,
                        "t_warehouse": warehouse,
                        "basic_rate": rate,
                        "allow_zero_valuation_rate": 0,
                    }
                ],
            }
        )
        se.insert(ignore_permissions=True)
        se.submit()
    except Exception as exc:  # pragma: no cover - stock setup varies by site
        print(f"warn: could not stock {item_code}: {exc}")


def _item_rows(spec: dict, party_map: dict, name_map: dict, warehouse: str) -> list[dict]:
    rows = []
    for line in spec["items"]:
        code = party_map["items"][line["itemKey"]]
        row = {
            "item_code": code,
            "qty": line["qty"],
            "rate": line["rate"],
            "warehouse": warehouse,
            "schedule_date": spec.get("postingDate"),
        }
        so_ref = line.get("salesOrderRef") or spec.get("salesOrderLink")
        if so_ref:
            so_key = f"SO-{so_ref['index']:02d}" if isinstance(so_ref.get("index"), int) else None
            # plan keys use pad2 via JS; rebuild
            so_key = f"SO-{str(so_ref['index']).zfill(2)}"
            so_name = name_map.get(so_key)
            if so_name:
                row["sales_order"] = so_name
        rows.append(row)
    return rows


def _create_one(
    kind: str,
    spec: dict,
    plan: dict,
    party_map: dict,
    name_map: dict,
    company: str,
    warehouse: str,
    tag: str,
    posting: str,
    as_of: str,
) -> str:
    key = spec["key"]
    existing = _find_existing(dt := _doctype(kind), tag, key)
    if existing:
        print(f"skip existing {dt} {existing} ({key})")
        return existing

    source = spec.get("source")
    if source:
        src_key = source.get("key") or _plan_key(source["kind"], source["index"])
        src_name = name_map.get(src_key)
        if not src_name:
            raise frappe.ValidationError(f"{key}: missing source {src_key} in name_map")
        doc = _map_from_source(kind, source["kind"], src_name, posting, tag, key, spec, warehouse)
    else:
        doc = _new_from_nothing(kind, spec, party_map, name_map, company, warehouse, tag, posting, as_of)

    _apply_tag_fields(doc, tag, key)
    _apply_doc_taxes(doc, kind, spec, party_map)
    if kind == "purchase_invoice":
        _normalize_pi_dates(doc, posting, spec)
    doc.flags.ignore_permissions = True
    doc.insert()
    if cint(spec.get("asDraft")):
        print(f"created draft {doc.doctype} {doc.name} ({key})")
        return doc.name
    doc.submit()
    if kind == "purchase_order" and spec.get("advancePayment") and not cint(spec.get("asDraft")):
        _try_advance_against_po(doc, spec, tag, posting)
    print(f"created {doc.doctype} {doc.name} ({key}) source={source}")
    return doc.name


def _normalize_pi_dates(doc, posting: str, spec: dict) -> None:
    """Keep bill_date / due_date / schedule coherent after map-from-source (seed only).

    OI-161 Packet G: a spec carrying an explicit `paymentSchedule` (dueDate/amount pairs, already
    resolved to calendar dates by emit-plan.js) gets those rows instead of the flat 30-day flatten —
    every other Bill keeps today's behavior byte-for-byte.
    """
    doc.posting_date = posting
    if hasattr(doc, "set_posting_time"):
        doc.set_posting_time = 1
    doc.bill_date = posting

    # A5: once a bill carries a payment_terms_template, a hard-coded posting+30 is not just
    # cosmetically wrong — `accounts_controller.validate_invoice_documents_schedule` calls
    # `validate_due_date`, which THROWS when due_date is later than the template's own computed
    # date. A Net 15 term died on exactly this ("Due Date cannot be after 08-14-2026").
    tmpl = (getattr(doc, "payment_terms_template", None) or "").strip()
    schedule = spec.get("paymentSchedule")

    if schedule and hasattr(doc, "payment_schedule"):
        # Packet G's multi-installment batching fixtures. Their explicit schedule IS the fixture,
        # so it wins over the template — but the template link is kept (so the rows can still name
        # a term and a method) and `ignore_default_payment_terms_template` switches off the
        # due-date/amount validation that would otherwise reject a 90-day daily schedule against a
        # Net 30 term.
        term_mode = (
            frappe.db.get_value("Payment Term", tmpl, "mode_of_payment") if tmpl else None
        )
        doc.set("payment_schedule", [])
        for row in schedule:
            line = {
                "due_date": row["dueDate"],
                "invoice_portion": 0,
                "payment_amount": row["amount"],
                "outstanding": row["amount"],
            }
            if tmpl:
                # Template and Term are deliberately created under the SAME name by
                # `_ensure_payment_terms`, so the template name is also a valid Payment Term link.
                line["payment_term"] = tmpl
                if term_mode:
                    line["mode_of_payment"] = term_mode
            doc.append("payment_schedule", line)
        doc.due_date = schedule[-1]["dueDate"]
        if tmpl:
            doc.ignore_default_payment_terms_template = 1
    elif tmpl:
        # Clear the mapped-in schedule so `set_payment_schedule` rebuilds it from the template,
        # and take the due date from ERPNext's own helper — the same one the validator compares to.
        doc.set("payment_schedule", [])
        doc.due_date = get_due_date_from_template(tmpl, posting, posting)
    else:
        doc.due_date = add_days(getdate(posting), 30)
        if hasattr(doc, "payment_schedule"):
            doc.set("payment_schedule", [])


def _apply_doc_taxes(doc, kind: str, spec: dict, party_map: dict) -> None:
    """Attach sales tax template or enable TDS withholding before insert/submit."""
    tax_meta = (party_map or {}).get("_tax") or {}
    if kind == "sales_invoice" and spec.get("salesTax") and not cint(spec.get("asDraft")):
        tmpl = tax_meta.get("sales_tax_template")
        if tmpl and frappe.db.exists("Sales Taxes and Charges Template", tmpl):
            doc.taxes_and_charges = tmpl
            try:
                doc.set_taxes()
            except Exception as exc:
                print(f"warn: set_taxes {spec.get('key')}: {exc}")
            if not doc.get("taxes"):
                tmpl_doc = frappe.get_doc("Sales Taxes and Charges Template", tmpl)
                doc.set("taxes", [])
                for row in tmpl_doc.taxes or []:
                    doc.append(
                        "taxes",
                        {
                            "charge_type": row.charge_type,
                            "account_head": row.account_head,
                            "description": row.description or row.account_head,
                            "rate": row.rate,
                        },
                    )
            try:
                doc.calculate_taxes_and_totals()
            except Exception as exc:
                print(f"warn: SI tax calc {spec.get('key')}: {exc}")
    if kind == "purchase_invoice" and spec.get("taxWithholding") and not cint(spec.get("asDraft")):
        # Newer ERPNext: PurchaseTaxWithholding runs on validate when supplier has category.
        if hasattr(doc, "ignore_tax_withholding_threshold"):
            doc.ignore_tax_withholding_threshold = 1
        if hasattr(doc, "apply_tax_withholding_amount"):
            doc.apply_tax_withholding_amount = 1
        tds = tax_meta.get("tds_category")
        if tds and hasattr(doc, "tax_withholding_category"):
            doc.tax_withholding_category = tds


def _plan_key(kind: str, index: int) -> str:
    abbrev = {
        "quotation": "Q",
        "sales_order": "SO",
        "sales_invoice": "SI",
        "purchase_order": "PO",
        "purchase_receipt": "PR",
        "purchase_invoice": "PI",
    }[kind]
    return f"{abbrev}-{str(index).zfill(2)}"


def _doctype(kind: str) -> str:
    return {
        "quotation": "Quotation",
        "sales_order": "Sales Order",
        "sales_invoice": "Sales Invoice",
        "purchase_order": "Purchase Order",
        "purchase_receipt": "Purchase Receipt",
        "purchase_invoice": "Purchase Invoice",
    }[kind]


def _map_from_source(
    kind: str,
    source_kind: str,
    source_name: str,
    posting: str,
    tag: str,
    key: str,
    spec: dict,
    warehouse: str,
):
    if kind == "sales_order" and source_kind == "quotation":
        from erpnext.selling.doctype.quotation.quotation import make_sales_order

        doc = make_sales_order(source_name)
    elif kind == "sales_invoice" and source_kind == "sales_order":
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice

        doc = make_sales_invoice(source_name)
        doc.update_stock = 0
    elif kind == "purchase_receipt" and source_kind == "purchase_order":
        from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

        doc = make_purchase_receipt(source_name)
    elif kind == "purchase_invoice" and source_kind == "purchase_order":
        from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_invoice

        doc = make_purchase_invoice(source_name)
        doc.update_stock = 0
    elif kind == "purchase_invoice" and source_kind == "purchase_receipt":
        from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

        doc = make_purchase_invoice(source_name)
        doc.update_stock = 0
    else:
        raise frappe.ValidationError(f"Unsupported map {source_kind} → {kind}")

    _stamp_dates(doc, kind, posting)
    _apply_tag_fields(doc, tag, key)
    if spec.get("logbookPoNo") and kind == "purchase_order":
        doc.title = str(spec["logbookPoNo"])
    if hasattr(doc, "set_warehouse") and not doc.set_warehouse:
        doc.set_warehouse = warehouse
    for row in doc.get("items") or []:
        if hasattr(row, "warehouse") and not row.warehouse:
            row.warehouse = warehouse
    partial = spec.get("partialReceive") or []
    for adj in partial:
        idx = cint(adj.get("lineIndex", 0))
        if 0 <= idx < len(doc.items or []):
            doc.items[idx].qty = flt(adj.get("qty"))
    if partial:
        try:
            doc.run_method("calculate_taxes_and_totals")
        except Exception:
            pass
    # Defence: never post a mapped child before its source document date
    src_dt = _doctype(source_kind)
    src_date_field = (
        "transaction_date"
        if source_kind in {"quotation", "sales_order", "purchase_order"}
        else "posting_date"
    )
    src_date = frappe.db.get_value(src_dt, source_name, src_date_field)
    if src_date and getdate(posting) < getdate(src_date):
        posting = str(add_days(getdate(src_date), 1))
        _stamp_dates(doc, kind, posting)
    if kind == "purchase_invoice" and spec.get("billNo"):
        doc.bill_no = spec["billNo"]
        doc.bill_date = posting
    return doc


def _new_from_nothing(kind, spec, party_map, name_map, company, warehouse, tag, posting, as_of):
    items = _item_rows(spec, party_map, name_map, warehouse)
    for row in items:
        row["schedule_date"] = posting

    if kind == "quotation":
        # Keep valid past seed asOf so make_sales_order still works for older Q dates
        doc = frappe.get_doc(
            {
                "doctype": "Quotation",
                "quotation_to": "Customer",
                "party_name": party_map["customers"][spec["partyKey"]],
                "company": company,
                "transaction_date": posting,
                "valid_till": add_days(as_of, 30),
                "order_type": "Sales",
                "items": [{k: v for k, v in row.items() if k != "warehouse"} for row in items],
            }
        )
    elif kind == "sales_order":
        doc = frappe.get_doc(
            {
                "doctype": "Sales Order",
                "customer": party_map["customers"][spec["partyKey"]],
                "company": company,
                "transaction_date": posting,
                "delivery_date": add_days(posting, 7),
                "items": [
                    {
                        **{k: v for k, v in row.items() if k != "sales_order"},
                        "delivery_date": add_days(posting, 7),
                    }
                    for row in items
                ],
            }
        )
    elif kind == "sales_invoice":
        doc = frappe.get_doc(
            {
                "doctype": "Sales Invoice",
                "customer": party_map["customers"][spec["partyKey"]],
                "company": company,
                "posting_date": posting,
                "set_posting_time": 1,
                "due_date": add_days(posting, 30),
                "update_stock": 0,
                "items": [{k: v for k, v in row.items() if k != "sales_order"} for row in items],
            }
        )
    elif kind == "purchase_order":
        supplier_name = party_map["suppliers"][spec["partyKey"]]
        payload = {
            "doctype": "Purchase Order",
            "supplier": supplier_name,
            "company": company,
            "transaction_date": posting,
            "schedule_date": add_days(posting, 7),
            "items": [
                {
                    **row,
                    "schedule_date": add_days(posting, 7),
                }
                for row in items
            ],
        }
        # Terms on the order too, so a PO → Bill flow carries them the way a real one would.
        po_tmpl = frappe.db.get_value("Supplier", supplier_name, "payment_terms")
        if po_tmpl:
            payload["payment_terms_template"] = po_tmpl
        doc = frappe.get_doc(payload)
    elif kind == "purchase_receipt":
        doc = frappe.get_doc(
            {
                "doctype": "Purchase Receipt",
                "supplier": party_map["suppliers"][spec["partyKey"]],
                "company": company,
                "posting_date": posting,
                "set_posting_time": 1,
                "items": items,
            }
        )
    elif kind == "purchase_invoice":
        supplier_name = party_map["suppliers"][spec["partyKey"]]
        # A5: `due_date` is DELIBERATELY not set when the supplier has terms. Creating a doc
        # server-side never calls `get_party_details`, so the template does not auto-populate the
        # way it does in the Desk UI — it has to be set explicitly. Once it is,
        # `accounts_controller.set_payment_schedule` builds the payment_schedule from the template
        # and derives the header due_date from it. Hard-coding posting+30 alongside that would
        # fight ERPNext's own arithmetic and silently win for the non-Net-30 terms.
        payload = {
            "doctype": "Purchase Invoice",
            "supplier": supplier_name,
            "company": company,
            "posting_date": posting,
            "set_posting_time": 1,
            "bill_no": spec.get("billNo"),
            "bill_date": posting,
            "update_stock": 0,
            "items": [{k: v for k, v in row.items() if k != "sales_order"} for row in items],
        }
        pi_tmpl = frappe.db.get_value("Supplier", supplier_name, "payment_terms")
        if pi_tmpl:
            payload["payment_terms_template"] = pi_tmpl
            # Set it explicitly rather than leaving it blank: `set_due_date` runs BEFORE
            # `set_payment_schedule` in ERPNext's validate order, so an empty due_date is not
            # backfilled from the schedule the template is about to build.
            payload["due_date"] = get_due_date_from_template(pi_tmpl, posting, posting)
        else:
            payload["due_date"] = add_days(posting, 30)
        doc = frappe.get_doc(payload)
    else:
        raise frappe.ValidationError(f"Unknown kind {kind}")
    _apply_tag_fields(doc, tag, spec["key"])
    if spec.get("logbookPoNo") and kind == "purchase_order":
        doc.title = str(spec["logbookPoNo"])
    return doc


def _stamp_dates(doc, kind: str, posting: str) -> None:
    if kind in {"quotation", "sales_order", "purchase_order"}:
        doc.transaction_date = posting
    if kind == "quotation":
        # valid_till already set relative to as_of on create; leave mapped as-is
        pass
    if kind == "sales_order":
        doc.delivery_date = add_days(posting, 7)
        for row in doc.items:
            row.delivery_date = add_days(posting, 7)
    if kind == "purchase_order":
        doc.schedule_date = add_days(posting, 7)
        for row in doc.items:
            row.schedule_date = add_days(posting, 7)
    if kind in {"sales_invoice", "purchase_invoice", "purchase_receipt"}:
        doc.posting_date = posting
        doc.set_posting_time = 1
    if kind == "sales_invoice":
        doc.due_date = add_days(posting, 30)
    if kind == "purchase_invoice":
        doc.bill_date = posting
        # Same trap as _normalize_pi_dates: posting+30 contradicts any non-Net-30 template and
        # ERPNext throws rather than warns. Derive from the template when there is one.
        pi_tmpl = (getattr(doc, "payment_terms_template", None) or "").strip()
        doc.due_date = (
            get_due_date_from_template(pi_tmpl, posting, posting)
            if pi_tmpl
            else add_days(posting, 30)
        )


def _resolve_bank_account(company: str) -> str:
    for account_type in ("Bank", "Cash"):
        acct = frappe.db.get_value(
            "Account",
            {"company": company, "account_type": account_type, "is_group": 0},
            "name",
        )
        if acct:
            return acct
    acct = frappe.db.get_value(
        "Account",
        {"company": company, "account_type": ("in", ("Bank", "Cash")), "is_group": 0},
        "name",
    )
    if not acct:
        raise frappe.ValidationError(f"No Bank/Cash account for {company} (OI-153 advance PE)")
    return acct


def _try_advance_against_po(po_doc, spec: dict, tag: str, posting: str) -> str | None:
    """OI-153: best-effort advance PE; clerk can create manually if site rejects allocation."""
    adv = spec.get("advancePayment") or {}
    amount = flt(adv.get("amount"))
    if amount <= 0 or adv.get("manual"):
        print(f"advance PE skipped (manual dogfood) for {spec.get('key')} amount={amount}")
        return None
    try:
        return _create_advance_against_po(po_doc, spec, tag, posting)
    except Exception as exc:  # pragma: no cover - ERPNext version variance
        print(f"warn: advance PE for {spec.get('key')} failed ({exc}); create PE Pay manually in dogfood")
        return None


def _create_advance_against_po(po_doc, spec: dict, tag: str, posting: str) -> str | None:
    """OI-153: supplier advance against submitted PO (Payment Entry, Pay)."""
    adv = spec.get("advancePayment") or {}
    amount = flt(adv.get("amount"))
    if amount <= 0:
        return None
    pe_key = adv.get("key") or f"ADV-{spec.get('key', po_doc.name)}"
    existing = _find_existing("Payment Entry", tag, pe_key)
    if existing:
        print(f"skip existing Payment Entry {existing} ({pe_key})")
        return existing

    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

    pe = get_payment_entry("Purchase Order", po_doc.name, party_amount=amount)
    pe.posting_date = posting
    pe.set_posting_time = 1
    pe.paid_amount = amount
    pe.received_amount = amount
    if pe.get("references"):
        for row in pe.references:
            if row.reference_doctype == "Purchase Order" and row.reference_name == po_doc.name:
                row.allocated_amount = amount
    _apply_tag_fields(pe, tag, pe_key)
    pe.flags.ignore_permissions = True
    pe.insert()
    pe.submit()
    print(f"created Payment Entry {pe.name} advance {amount} → PO {po_doc.name} ({pe_key})")
    return pe.name


def _reset_tagged(tag: str) -> int:
    """Cancel+delete sample docs tagged via title/remarks (children before parents)."""
    doctypes = [
        "Payment Entry",
        "Purchase Invoice",
        "Purchase Receipt",
        "Purchase Order",
        "Sales Invoice",
        "Sales Order",
        "Quotation",
    ]
    deleted = 0
    for dt in doctypes:
        names = set()
        meta = frappe.get_meta(dt)
        if meta.has_field("remarks"):
            names.update(frappe.get_all(dt, filters={"remarks": ("like", f"%[{tag}]%")}, pluck="name"))
        if meta.has_field("title"):
            names.update(frappe.get_all(dt, filters={"title": ("like", f"{tag}:%")}, pluck="name"))
        for name in names:
            doc = frappe.get_doc(dt, name)
            try:
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc(dt, name, force=1, ignore_permissions=True)
                deleted += 1
                print(f"deleted {dt} {name}")
            except Exception as exc:
                print(f"warn: could not delete {dt} {name}: {exc}")
    return deleted


# Allow `python seed_corpus.py /tmp/plan.json` when imported under bench cwd with frappe connected.
if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/corpus-plan.json"
    reset = "--reset" in sys.argv
    print(run(plan_path=path, reset=reset))
