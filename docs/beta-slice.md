# Beta slice (locked until the maintainer revises)

Public / `main` only advances when this limited surface is green.

1. Shell opens and reaches sandbox ERPNext over HTTP.
2. Vanilla skin works (stock Desk in the shell).
3. One Doc path (prefer **Bill**): read + save; child rows via ERPNext `set_value` discipline, covered by tests.
4. Offline unit suite always green (`npm test`) with **no** live server.
5. Smoke e2e (when added) may skip if ERP is down — never the only gate.

## Post-beta (stay on `alpha` until promoted)

History multi-window/tabs/tint, AP bowtie view, nickel rounding UI, 5-digit SO/PO series, date fat-finger filter — see museum `open_items.md` OI-040…044.

## Architecture (unchanged from decision log)

```
erpnext-ui-app (Electron + shortcuts + Doc skin)
        |  HTTP / API only
        v
Unmodified ERPNext  <—— also openable in a stock browser for troubleshooting
```

Clean Core: never edit `apps/frappe` / `apps/erpnext`. Customize via fixtures / `doc_compat` / this shell.

## Process

| Branch | Role |
|--------|------|
| `alpha` | Day-to-day work; may be ahead of stable |
| `main` | Stable / publishable beta only |

**5zorro** alone pushes to GitHub. Outside PRs: maintainer consults before merge.

Canonical process ADR (harness tree):  
`/home/pi/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`

Museum (frozen reference):  
`/home/pi/agent-harness/erpnext/doc-shell/`
