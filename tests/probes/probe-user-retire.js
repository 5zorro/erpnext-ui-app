/**
 * Retiring a restricted probe user (plan 10-19 § A restricted probe user) — the half that needs no
 * app and no login, so `run-probe` can do it after a probe was interrupted.
 *
 * Retire = disable the user **and** end its sessions. Disabling alone does not end them in Frappe
 * (`user.py` `on_update` clears sessions only on a user-type change). Both go through
 * `bench execute` in the backend container, which runs as Administrator and commits.
 *
 * The lock file names the user (never a password) while one may be enabled; `retired: true` once
 * it is not. `run-probe` reads it to retire a user a killed probe left enabled, and to know it must
 * put the app's login cookies back.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PROBE_USER_LOCK = path.join(ROOT, "test-logs", "probe-user.lock.json");
const BACKEND = process.env.ERP_BACKEND_CONTAINER || "frappe_docker-backend-1";
const SITE = process.env.ERP_SITE || "frontend";

/** @returns {{ users: string[], retired: boolean } | null} */
export function readProbeUserLock() {
  try {
    return JSON.parse(fs.readFileSync(PROBE_USER_LOCK, "utf8"));
  } catch {
    return null;
  }
}

/** Note a user that may be enabled from now on (before its password is set). */
export function lockProbeUser(user) {
  const cur = readProbeUserLock();
  const users = [...new Set([...((cur && !cur.retired && cur.users) || []), user])];
  fs.mkdirSync(path.dirname(PROBE_USER_LOCK), { recursive: true });
  fs.writeFileSync(PROBE_USER_LOCK, JSON.stringify({ users, retired: false, at: new Date().toISOString() }));
}

/** @param {string} method @param {Record<string, unknown>} kwargs */
function benchExecute(method, kwargs) {
  // bench evaluates --kwargs as a Python literal: JSON with True/False/None is one.
  const py = JSON.stringify(kwargs).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
  return execFileSync("docker", ["exec", "-w", "/home/frappe/frappe-bench", BACKEND, "bench", "--site", SITE, "execute", method, "--kwargs", py], {
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Disable each user and end its sessions. Never throws: returns one line per user.
 * @param {string[]} users
 * @returns {string[]}
 */
export function retireProbeUsers(users) {
  const out = [];
  for (const user of users || []) {
    if (!/^zz-probe-[\w.+-]*@example\.com$/.test(user)) {
      out.push(`${user}: not a probe user — left alone`);
      continue;
    }
    try {
      benchExecute("frappe.client.set_value", { doctype: "User", name: user, fieldname: "enabled", value: 0 });
      benchExecute("frappe.sessions.clear_sessions", { user, force: true });
      out.push(`${user}: disabled, sessions ended`);
    } catch (e) {
      const said = `${(e && e.stdout) || ""}\n${(e && e.stderr) || ""}`;
      if (/DoesNotExistError/.test(said)) {
        out.push(`${user}: no such user — nothing to retire`);
        continue;
      }
      const msg = (said.trim().split("\n").filter(Boolean).slice(-1)[0] || String((e && e.message) || e)).trim();
      out.push(`${user}: COULD NOT RETIRE (${msg}) — run: docker exec -w /home/frappe/frappe-bench ${BACKEND} bench --site ${SITE} execute frappe.client.set_value --kwargs "{'doctype':'User','name':'${user}','fieldname':'enabled','value':0}"`);
    }
  }
  return out;
}

/** Retire whatever the lock names, if it is not retired yet; mark it retired. Returns the lines. */
export function retireLockedProbeUsers() {
  const lock = readProbeUserLock();
  if (!lock || lock.retired) return [];
  const lines = retireProbeUsers(lock.users);
  if (lines.every((l) => !/COULD NOT RETIRE/.test(l))) {
    fs.writeFileSync(PROBE_USER_LOCK, JSON.stringify({ ...lock, retired: true, retiredAt: new Date().toISOString() }));
  }
  return lines;
}
