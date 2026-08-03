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

    tag = plan.get("tag") or "ui-app-sample-v1"
    as_of = as_of or plan.get("asOf") or nowdate()
    warehouse = _default_warehouse(company)

    if cint(reset):
        deleted = _reset_tagged(tag)
        frappe.db.commit()
        print(f"reset: deleted {deleted} tagged docs")

    party_map = _ensure_masters(plan["parties"], company, warehouse, tag)
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


def _ensure_masters(parties: dict, company: str, warehouse: str, tag: str) -> dict[str, dict[str, str]]:
    """Return maps: suppliers/customers/items keyed by plan key → ERP name/code."""
    out = {"suppliers": {}, "customers": {}, "items": {}}

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

    frappe.db.commit()
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
        src_key = _plan_key(source["kind"], source["index"])
        src_name = name_map.get(src_key)
        if not src_name:
            raise frappe.ValidationError(f"{key}: missing source {src_key} in name_map")
        doc = _map_from_source(kind, source["kind"], src_name, posting, tag, key, spec, warehouse)
    else:
        doc = _new_from_nothing(kind, spec, party_map, name_map, company, warehouse, tag, posting, as_of)

    _apply_tag_fields(doc, tag, key)
    doc.flags.ignore_permissions = True
    doc.insert()
    if cint(spec.get("asDraft")):
        print(f"created draft {doc.doctype} {doc.name} ({key})")
        return doc.name
    doc.submit()
    print(f"created {doc.doctype} {doc.name} ({key}) source={source}")
    return doc.name


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
    if hasattr(doc, "set_warehouse") and not doc.set_warehouse:
        doc.set_warehouse = warehouse
    for row in doc.get("items") or []:
        if hasattr(row, "warehouse") and not row.warehouse:
            row.warehouse = warehouse
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
        doc = frappe.get_doc(
            {
                "doctype": "Purchase Order",
                "supplier": party_map["suppliers"][spec["partyKey"]],
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
        )
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
        doc = frappe.get_doc(
            {
                "doctype": "Purchase Invoice",
                "supplier": party_map["suppliers"][spec["partyKey"]],
                "company": company,
                "posting_date": posting,
                "set_posting_time": 1,
                "bill_no": spec.get("billNo"),
                "bill_date": posting,
                "due_date": add_days(posting, 30),
                "update_stock": 0,
                "items": [{k: v for k, v in row.items() if k != "sales_order"} for row in items],
            }
        )
    else:
        raise frappe.ValidationError(f"Unknown kind {kind}")
    _apply_tag_fields(doc, tag, spec["key"])
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
        doc.due_date = add_days(posting, 30)


def _reset_tagged(tag: str) -> int:
    """Cancel+delete sample docs tagged via title/remarks (children before parents)."""
    doctypes = [
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
