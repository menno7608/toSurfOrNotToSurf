"""Compressie, beveiligingsheaders en een toeganglog zonder IP-adressen (29-09).

Waarom dit er is (audit 29-09):
- /api/spots was 1,56 MB ongecomprimeerd. Cloudflare comprimeert pas richting de
  bezoeker, dus de volle 1,56 MB ging per verzoek over de uplink van de Pi, die
  ± 0,7 van zulke antwoorden per seconde haalt. gzip hier maakt dat ± 200 kB.
- Er was geen enkele toeganglog, dus aantallen bezoekers, foutcodes en
  responstijden waren onbekend.

De toeganglog slaat nooit een IP-adres op. Een bezoeker is een hash van het IP
met een zout dat per dag wisselt: binnen een dag tel je unieke bezoekers, over
dagen heen is niemand te volgen. Formaat (één JSON-regel per verzoek) is bewust
eenvoudig, zodat de Sites-monitor van Archimedes het ook voor andere projecten
kan lezen: {ts, pad, status, ms, bytes, bezoeker, soort}.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, request

_COMPRIMEERBAAR = ("application/json", "text/html", "text/plain", "text/css",
                   "application/javascript", "text/javascript")
_MIN_BYTES = 1024
_BEWAAR_DAGEN = 14
_BOTS = ("bot", "crawler", "spider", "curl", "wget", "python-requests", "httpx",
         "headless", "monitor", "uptime")


def _soort(ua: str) -> str:
    ua = ua.lower()
    if "sitewacht" in ua:
        return "monitor"
    return "bot" if any(b in ua for b in _BOTS) or not ua else "browser"


class _Log:
    def __init__(self, map_: Path):
        self.map = map_
        self.lock = threading.Lock()
        self.zout: tuple[str, bytes] | None = None
        self.opgeruimd: str | None = None

    def _dagzout(self, dag: str) -> bytes:
        if self.zout and self.zout[0] == dag:
            return self.zout[1]
        pad = self.map / f".zout-{dag}"
        try:
            waarde = pad.read_bytes()
        except OSError:
            waarde = secrets.token_bytes(32)
            fd = os.open(pad, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(waarde)
        self.zout = (dag, waarde)
        return waarde

    def _opruimen(self, dag: str) -> None:
        if self.opgeruimd == dag:
            return
        grens = (datetime.now(timezone.utc) - timedelta(days=_BEWAAR_DAGEN)).strftime("%Y-%m-%d")
        for pad in self.map.glob("*"):
            datum = pad.name.split("-", 1)[-1][:10]
            if (pad.name.startswith("toegang-") or pad.name.startswith(".zout-")) and datum < grens:
                pad.unlink(missing_ok=True)
        self.opgeruimd = dag

    def schrijf(self, regel: dict, ip: str) -> None:
        nu = datetime.now(timezone.utc)
        dag = nu.strftime("%Y-%m-%d")
        with self.lock:
            self.map.mkdir(parents=True, exist_ok=True, mode=0o700)
            zout = self._dagzout(dag)
            regel["bezoeker"] = hashlib.sha256(zout + ip.encode()).hexdigest()[:12]
            regel["ts"] = nu.isoformat(timespec="seconds")
            pad = self.map / f"toegang-{dag}.jsonl"
            fd = os.open(pad, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as f:
                f.write(json.dumps(regel, separators=(",", ":")) + "\n")
            self._opruimen(dag)


def installeer(app: Flask, logmap: str | os.PathLike | None = None) -> None:
    map_ = Path(logmap or os.environ.get("TOEGANG_DIR", "~/.local/state/tosurf")).expanduser()
    log = _Log(map_)

    @app.before_request
    def _start():
        g._webwacht_start = time.perf_counter()

    @app.after_request
    def _na(resp):
        # Beveiligingsheaders. Bewust geen CSP: webcams en HLS komen van veel
        # bronnen en een te strenge CSP breekt ze stil. Eerst inventariseren.
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")

        if ("gzip" in request.headers.get("Accept-Encoding", "")
                and not resp.direct_passthrough
                and resp.mimetype in _COMPRIMEERBAAR
                and "Content-Encoding" not in resp.headers
                and 200 <= resp.status_code < 300):
            data = resp.get_data()
            if len(data) >= _MIN_BYTES:
                resp.set_data(gzip.compress(data, compresslevel=5))
                resp.headers["Content-Encoding"] = "gzip"
                resp.headers["Vary"] = "Accept-Encoding"

        try:
            ms = int((time.perf_counter() - g.get("_webwacht_start", time.perf_counter())) * 1000)
            ip = (request.headers.get("CF-Connecting-IP")
                  or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                  or request.remote_addr or "")
            log.schrijf({
                "pad": request.path[:200],
                "status": resp.status_code,
                "ms": ms,
                "bytes": resp.content_length,
                "soort": _soort(request.headers.get("User-Agent", "")),
            }, ip)
        except Exception as e:  # een logfout mag nooit een bezoeker raken
            print(f"[WARN] toeganglog: {e}")
        return resp
