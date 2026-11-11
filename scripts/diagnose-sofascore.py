#!/usr/bin/env python3
"""Diagnóstico: prueba varias formas de presentarse ante Sofascore y dice cuál recibe 200.

No toca Supabase ni escribe nada. Solo hace ~15 peticiones espaciadas (tarda ~40 s).
Pega la salida completa para ajustar scripts/import-xg.py.
"""

import os
import platform
import re
import sys
import time

from curl_cffi import requests as cffi
import curl_cffi

UA157 = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
         "Chrome/157.0.0.0 Safari/537.36")
PATH = "/unique-tournament/8"
BASES = [b for b in os.environ.get(
    "DIAG_BASES", "https://api.sofascore.com/api/v1,https://www.sofascore.com/api/v1").split(",") if b]
REFERER = {"Referer": "https://www.sofascore.com/", "Origin": "https://www.sofascore.com"}


def sec_ch_ua(major):
    chars = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"]
    grease = f'"Not{chars[major % 11]}A{chars[(major + 1) % 11]}Brand";v="{["8", "99", "24"][major % 3]}"'
    order = [(0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0)][major % 6]
    items = [""] * 3
    for brand, pos in zip((grease, f'"Chromium";v="{major}"', f'"Google Chrome";v="{major}"'), order):
        items[pos] = brand
    return ", ".join(items)


def targets():
    try:
        from curl_cffi.requests import BrowserType
        names = [b.value for b in BrowserType]
    except Exception:
        return None, None
    chromes = sorted((n for n in names if re.fullmatch(r"chrome\d+", n)), key=lambda n: int(n[6:]))
    return (chromes[-1] if chromes else None), names


latest_chrome, all_names = targets()

VARIANTS = [
    ("A. chrome, sin cabeceras propias", dict(impersonate="chrome", headers={})),
    ("B. chrome + Referer/Origin", dict(impersonate="chrome", headers=dict(REFERER))),
    ("C. chrome + UA157 + sec-ch-ua157 + Referer/Origin (como el script)",
     dict(impersonate="chrome", headers={**REFERER, "User-Agent": UA157, "sec-ch-ua": sec_ch_ua(157)})),
    ("D. chrome + UA157 (sec-ch-ua de curl_cffi) + Referer/Origin",
     dict(impersonate="chrome", headers={**REFERER, "User-Agent": UA157})),
]
if latest_chrome:
    VARIANTS.append((f"E. {latest_chrome} (el más nuevo de tu curl_cffi), sin cabeceras propias",
                     dict(impersonate=latest_chrome, headers={})))
for extra in ("safari", "firefox"):
    if all_names and extra in all_names:
        VARIANTS.append((f"F. {extra} + Referer/Origin", dict(impersonate=extra, headers=dict(REFERER))))


def main():
    print(f"Python {platform.python_version()} ({sys.executable})")
    print(f"curl_cffi {curl_cffi.__version__}; chrome más nuevo que conoce: {latest_chrome}")
    print()
    ok = []
    for base in BASES:
        print(f"=== {base}")
        for label, kw in VARIANTS:
            try:
                r = cffi.get(base + PATH, timeout=20, **kw)
                body = " ".join(r.text.split())[:110]
                server = r.headers.get("server", "")
                extra = f" server={server}" if server else ""
                if r.headers.get("cf-mitigated"):
                    extra += f" cf-mitigated={r.headers.get('cf-mitigated')}"
                print(f"{r.status_code}  {label}{extra}\n     {body}")
                if r.status_code == 200:
                    ok.append((base, label))
            except Exception as e:
                print(f"ERR  {label}: {type(e).__name__}: {str(e)[:120]}")
            time.sleep(2.5)
    print("\n=== Resultado")
    if ok:
        for base, label in ok:
            print(f"  FUNCIONA: {label}  ->  {base}")
    else:
        print("  Ninguna variante recibió 200.")


if __name__ == "__main__":
    main()
