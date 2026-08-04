# Sample data seed (sandbox only) — OI-055 / plan S−1

Deterministic corpus for dogfooding **create from nothing** vs **create from source**
across Quotation, Sales Order, Sales Invoice, Purchase Order, Purchase Receipt, and
Purchase Invoice (~25 **submitted** each + **5 drafts** each, last 60 days, multiple
SAMPLE vendors/customers). Drafts are create-from-nothing and use distinct parties
(first 5 vendors / customers) so Find Bill can open real `docstatus === 0` rows.

## Layout

| Path | Role |
|------|------|
| `src/sample-data/corpus-plan.js` | Pure plan SSoT (unit-tested) |
| `src/sample-data/sandbox-guard.js` | Allowlist / confirm checks (unit-tested) |
| `ops/sample-data/emit-plan.js` | Emit plan JSON |
| `ops/sample-data/seed_corpus.py` | Frappe applicator (`bench execute`) |
| `ops/sample-data/run-seed.sh` | Docker + sandbox gate |

## Run

```bash
# frappe_docker up on :8080, company name contains SANDBOX
CONFIRM_SAMPLE_SEED=1 npm run seed:sample

# wipe prior tagged docs then recreate
CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset
```

Idempotent without `--reset`: skips docs whose `remarks` already contain `[ui-app-sample-v1]`.

## Link graph (summary)

| Doc | From source | From nothing | Leftover open sources |
|-----|-------------|--------------|------------------------|
| SO | 15 ← Quotation | 10 | Quotation 15–24 unconverted |
| SI | 12 ← SO | 13 | SO 12–24 uninvoiced |
| PR | 12 ← PO | 13 (NIC) | |
| PI | 8 ← PR, 8 ← PO | 9 | PO 20–24 open (no PR/PI) |

Every 4th PO also sets `sales_order` on lines (SO picker on PO).
