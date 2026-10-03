# Printing on WSL / Linux

The shell prints the way the plan's printing convention says: ERPNext renders every page and PDF
on the **server** (its own `wkhtmltopdf`, inside the ERPNext container), and Electron hands the
page to a printer. So the only local piece is the **printing system** Electron talks to — on
Linux that is CUPS. Without it Electron sees no printers: *Save PDF* still works, and *Print*
offers only the system dialog's *Print to file*.

## Minimal setup (Ubuntu / WSL)

```bash
sudo apt install -y cups printer-driver-cups-pdf
sudo service cups start      # WSL without systemd: start it after each restart of WSL
lpstat -p                    # should list a printer named "PDF"
```

`printer-driver-cups-pdf` adds a virtual printer called **PDF** that writes each job to `~/PDF/`.
That is enough to test printer choice, the recent-printers list and silent batch printing
(a check run) without paper.

## Real printers

Not needed for development. A Windows printer can be reached from WSL's CUPS by its network
address (`lpadmin -p <name> -E -v ipp://<printer-or-host>/ipp/print -m everywhere`), or run the
Windows build of the shell, which sees Windows printers directly.
