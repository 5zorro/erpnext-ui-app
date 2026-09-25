#!/usr/bin/env python3
"""Regenerate the receiving scanner's home-screen icons (pwa/receiving/icons/). Stdlib only.

White bars on a dark tile, kept inside the central 60% so Android's round "maskable" crop never
cuts a bar. The bar pattern is decorative, not a readable barcode.

    python3 ops/receiving-proxy/make-icons.py
"""
import os
import struct
import zlib

BARS = "11010010000110011001100110110011100101100111001101100101"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "pwa", "receiving", "icons")


def png(size, name):
    bg, fg = (24, 33, 43), (255, 255, 255)
    safe = int(size * 0.20)
    x0, x1 = safe, size - safe
    y0, y1 = int(size * 0.30), int(size * 0.70)
    w = (x1 - x0) / len(BARS)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            on = y0 <= y < y1 and x0 <= x < x1 and BARS[min(int((x - x0) / w), len(BARS) - 1)] == "1"
            row += bytes(fg if on else bg)
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(data)


png(192, "icon-192.png")
png(512, "icon-512.png")
png(180, "apple-touch-icon.png")
