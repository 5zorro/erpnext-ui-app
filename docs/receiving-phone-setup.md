# Receiving scanner — phone setup

How a phone gets the receiving scanner onto its home screen. Plan: `implementation-plan-2026-09-21.md`,
P2. There is no app store and no separate release: the scanner is a web page served next to ERPNext,
which a phone can save as an icon that opens full screen.

In the steps below, `HOST` means the address of the computer running ERPNext **on the Wi-Fi the
phones use** — something like `192.168.1.50`.

---

## Part 1 — once, on the computer running ERPNext

1. **Find its Wi-Fi address**, and **reserve it in the router** (usually "DHCP reservation" or
   "fixed IP" in the router's settings). The certificate is issued for that exact address. If the
   address changes, every phone sees a certificate error until the proxy is restarted with the new
   one.
2. **Set it:** copy `ops/receiving-proxy/.env.example` to `ops/receiving-proxy/.env` and put the
   address in it. That file is gitignored.
3. **Start the front door:**

   ```bash
   docker compose -f ops/receiving-proxy/compose.yml up -d
   ```

   It keeps running and comes back after a restart. To stop it:
   `docker compose -f ops/receiving-proxy/compose.yml down`. ERPNext itself is not touched either way.
4. **Check it** from the computer: `http://HOST:8081` should answer with a line of setup text, and
   `https://HOST:8443/receiving/` should load (after a certificate warning, until this computer
   trusts the certificate too — that is expected).
5. **Never forward a router port to this computer** for the pilot. The scanner is for phones on your
   own Wi-Fi only.

**Keep the `receiving-proxy_caddy_data` Docker volume.** It holds the certificate authority every
phone has been told to trust. Deleting it creates a new one, and every phone has to repeat step 1 of
the card below.

**Windows note.** On this setup Docker Desktop runs on Windows, and Windows lets phones reach it
only while the Wi-Fi is marked a **Private** network. That same rule is what makes ERPNext's own
port reachable from the Wi-Fi too — see *What trusting the certificate means* below.

---

## Part 2 — the card, once per phone

Print this part. The whole thing takes about two minutes.

**Before you start:** the phone must be on the same Wi-Fi as the computer.

### Step 1 — trust the certificate

Open **`http://HOST:8081/receiving-ca.crt`** in the phone's browser. It downloads a small file.

- **iPhone:** a message says a profile was downloaded. Open **Settings → Profile Downloaded →
  Install**. Then — the step everyone misses — **Settings → General → About → Certificate Trust
  Settings**, and switch on the receiving certificate. Without that switch the phone keeps refusing
  the connection.
- **Android:** open the downloaded file, or go to **Settings → Security → Encryption & credentials →
  Install a certificate → CA certificate** (names vary a little by phone). Confirm the warning.

A browser "proceed anyway" button is **not** a substitute. The phone will open the page, but it will
not offer to save it to the home screen and the camera may be refused.

### Step 2 — open the setup page

Open **`https://HOST:8443/receiving/install.html`**. If a certificate warning appears, step 1 is not
finished.

### Step 3 — put it on the home screen

- **iPhone:** in **Safari** (it has to be Safari), tap **Share → Add to Home Screen**. iPhones never
  offer this by themselves.
- **Android:** tap **Install Receiving** on the setup page, or the browser menu **⋮ → Install app**.

### Step 4 — open it from the new icon

The phone check runs by itself. Give the phone a name ("Dock 1", "Sam's phone"), and tap **Test the
camera**. When every line shows ✓, the phone is ready.

---

## What trusting the certificate means

Said plainly, because it is the one real cost of this setup:

- A phone that trusts this certificate authority will accept **any** web address it vouches for,
  not only this one. Its private key sits on the ERPNext computer. If that computer were taken over,
  whoever held the key could impersonate other websites to those phones.
  **So:** use phones dedicated to receiving where you can, keep the ERPNext computer patched and
  locked, and remove the certificate from a phone when it leaves the pilot (iPhone: Settings →
  General → VPN & Device Management; Android: Settings → Security → Trusted credentials → User).
- **A lost phone** is the likelier problem. The receiving account is limited on purpose — it cannot
  pay, adjust stock, edit items or cancel a receipt. Disable that ERPNext user and the phone is
  locked out, whatever it still has saved. The certificate on its own grants no access to anything.
- **ERPNext's own port, 8080, is reachable from the same Wi-Fi without encryption.** That was true
  before this scanner existed. Anyone on the Wi-Fi can reach its login page, so ERPNext's passwords
  have to be real ones, not the sandbox default.

The plain-HTTP address in step 1 serves the certificate and nothing else. It does not lead to
ERPNext.
