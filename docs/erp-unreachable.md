# ERP unreachable — what to do

The shell **pings** ERP (`http://localhost:8080` by default) and shows the result on the
toolbar DB light → **Connection details**. That panel **reports**; it does **not** start Docker
by itself.

## On this ERP host (WSL / frappe_docker)

After reboot or a partial wake, nginx/websocket often crash-loop until upstream DNS exists
(`backend:8000`, `redis-queue`). Bring the stack up **without** opening a UI:

```bash
bash ~/erpnext-ui-app/ops/erp-host/ensure-erp-up.sh
# then, if you want this repo's shell:
cd ~/erpnext-ui-app && npm start
```

Legacy wrapper (same bring-up; museum launch only if you ask):

```bash
bash /home/pi/erpnext/frappe_docker/start-shell.sh              # ERP only
bash /home/pi/erpnext/frappe_docker/start-shell.sh --launch-museum  # + museum shell
```

Admin GUI (museum Doc Ops, OI-038): allowlisted start/stop/doctor on the ERP host — not inside
clerk chrome. Deeper diagnose/fix suite: OI-080.

## IT recovery settings (in the shell)

Clones ship with **no** autofix script and **no** notify URL (security).

1. Open **Connection details** (DB light).
2. Choose **Set up how IT wants to handle this…**
3. Pick either:
   - **Notify** — HTTPS form URL (e.g. Google Form). When ERP is down → **Notify IT**.
   - **Autofix** — pick an **absolute** path to an IT-written script on *this* PC. When ERP is
     down → **Start ERPNext** (confirm each run). The app never embeds a default path.
     Point autofix at `ensure-erp-up.sh` (or a tailored copy), **not** at a script that
     also launches museum Electron unless that is intentional.

Prefs live only under Electron `userData` (`health-remediation.json`), not in the git tree.

### Example scripts for ERP hosts

| Script | Role |
|--------|------|
| `ops/erp-host/ensure-erp-up.sh` | **Preferred** — docker up + DNS-race fix + ping check; no UI |
| `ops/erp-host/restart-erp.example.sh` | Thin copy-me wrapper → `ensure-erp-up.sh` |
| `frappe_docker/start-shell.sh` | Calls ensure; optional `--launch-museum` for Doc Ops |

## Security notes

- Relative paths and `http://` notify URLs are rejected.
- Autofix uses `spawn` without a shell; only the configured absolute script runs after confirm.
- A fresh clone shows setup prompts, never a dead “Start ERPNext” button aimed at a missing script.
