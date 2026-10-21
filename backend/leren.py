"""Houdt per spot bij hoe ver elk model naast de meting zat, zodat best_match
kan kiezen wat daar het best werkt in plaats van altijd Open-Meteo's eigen,
niet-plekgebonden blend te volgen.

Twee tabellen: `voorspelling` (wat een model voor een uur voorspelde, op het
moment van ophalen) en `meting` (wat er echt gemeten is voor dat uur, uit
KNMI of Buienradar). `beste_model()` matcht ze op (spot, uur) en geeft het
model met de laagste gemiddelde afwijking terug — of None als er te weinig
overlap is, dan blijft de aanroeper op het gewone gedrag (Open-Meteo's eigen
best_match).

Alleen spots met een meetbron (KNMI-station dichtbij, of binnen het bereik
van Buienradar) krijgen hier ooit een winnaar; de rest heeft geen
grondwaarheid om tegen te vergelijken — dat is een feit over de databronnen,
geen gat in deze module.
"""
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

DB_PAD = os.environ.get("LEREN_DB_PAD") or os.path.join(os.path.dirname(__file__), "leren.db")

_MIN_PAREN = 100      # minimaal aantal gematchte (voorspelling, meting)-uren voor een score
_VENSTER_DAGEN = 21   # alleen recente fouten laten meetellen — modellen en weer veranderen
_CACHE_TTL = 3600     # seconden; voorkomt een db-query per request


@contextmanager
def _verbind():
    """Verbinding die na afloop commit én sluit. Ruime wachttijd: de cache-
    opwarming schrijft vanuit vier threads tegelijk, en met timeout=5 liep dat
    honderden keren uit op "database is locked" (17-20 okt), waarna de hele
    ophaalronde voor die spot mislukte."""
    conn = sqlite3.connect(DB_PAD, timeout=30)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _init():
    with _verbind() as conn:
        # WAL: lezen en schrijven blokkeren elkaar niet meer; blijft per bestand gelden.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""CREATE TABLE IF NOT EXISTS voorspelling (
            spot_id TEXT NOT NULL, model TEXT NOT NULL, voor_uur TEXT NOT NULL,
            wind_speed REAL, wind_dir REAL, vastgelegd_op TEXT,
            PRIMARY KEY (spot_id, model, voor_uur)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS meting (
            spot_id TEXT NOT NULL, meting_uur TEXT NOT NULL,
            wind_speed REAL, wind_dir REAL, bron TEXT, vastgelegd_op TEXT,
            PRIMARY KEY (spot_id, meting_uur)
        )""")
        # Windstoot erbij (20-10): de grafiek toont gemeten uren nu ook echt als
        # meting, en dan hoort de gemeten stoot erbij in plaats van die van het model.
        kolommen = {r[1] for r in conn.execute("PRAGMA table_info(meting)")}
        if "wind_gust" not in kolommen:
            conn.execute("ALTER TABLE meting ADD COLUMN wind_gust REAL")


_init()


def leg_voorspelling_vast(spot_id: str, model: str, uren) -> None:
    """`uren`: itereerbaar van (voor_uur: aware datetime UTC, wind_speed, wind_dir)."""
    nu = datetime.now(timezone.utc).isoformat()
    rijen = [(spot_id, model, u.isoformat(), v, d, nu) for u, v, d in uren if v is not None]
    if not rijen:
        return
    try:
        _schrijf_voorspellingen(rijen)
    except sqlite3.Error as e:
        # Leren is bijzaak: een schrijffout mag de weerdata nooit tegenhouden.
        print(f"[WARN] leren: voorspelling {spot_id}/{model} niet vastgelegd: {e}")


def _schrijf_voorspellingen(rijen) -> None:
    with _verbind() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO voorspelling "
            "(spot_id, model, voor_uur, wind_speed, wind_dir, vastgelegd_op) VALUES (?,?,?,?,?,?)",
            rijen,
        )


def leg_meting_vast(spot_id: str, meting_uur, wind_speed, wind_dir, bron: str, wind_gust=None) -> None:
    """`meting_uur`: aware datetime UTC, al op het hele uur afgerond door de aanroeper."""
    if wind_speed is None:
        return
    nu = datetime.now(timezone.utc).isoformat()
    try:
        with _verbind() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO meting "
                "(spot_id, meting_uur, wind_speed, wind_dir, bron, vastgelegd_op, wind_gust) VALUES (?,?,?,?,?,?,?)",
                (spot_id, meting_uur.isoformat(), wind_speed, wind_dir, bron, nu, wind_gust),
            )
    except sqlite3.Error as e:
        print(f"[WARN] leren: meting {spot_id} niet vastgelegd: {e}")


def metingen(spot_id: str, sinds) -> dict:
    """Vastgelegde metingen voor deze spot vanaf `sinds` (aware UTC):
    {uur (aware datetime UTC): {"v", "g", "dir", "bron"}}. Leeg bij een fout."""
    try:
        with _verbind() as conn:
            rijen = conn.execute(
                "SELECT meting_uur, wind_speed, wind_gust, wind_dir, bron FROM meting "
                "WHERE spot_id = ? AND meting_uur >= ?",
                (spot_id, sinds.isoformat()),
            ).fetchall()
    except sqlite3.Error as e:
        print(f"[WARN] leren: metingen {spot_id} niet gelezen: {e}")
        return {}
    return {datetime.fromisoformat(u): {"v": v, "g": g, "dir": d, "bron": b} for u, v, g, d, b in rijen}


_cache: dict[str, tuple] = {}  # spot_id -> (model_of_None, opgehaald_op)


def beste_model(spot_id: str, kandidaten: list[str]):
    """Model met de laagste gemiddelde absolute windsnelheidsfout voor deze
    spot over de laatste _VENSTER_DAGEN, of None zonder betrouwbare winnaar.
    `kandidaten`: modellen die deze plek dekken (_model_dekt in app.py) —
    er wordt nooit een model teruggegeven dat daar niet in zit."""
    if not kandidaten:
        return None
    cached = _cache.get(spot_id)
    if cached and time.time() - cached[1] < _CACHE_TTL:
        return cached[0] if cached[0] in kandidaten else None

    grens = (datetime.now(timezone.utc) - timedelta(days=_VENSTER_DAGEN)).isoformat()
    try:
        with _verbind() as conn:
            rijen = _scores(conn, spot_id, grens)
    except sqlite3.Error as e:
        print(f"[WARN] leren: geen score voor {spot_id}: {e}")
        return None

    winnaar = next((model for model, _mae, _n in rijen if model in kandidaten), None)
    _cache[spot_id] = (winnaar, time.time())
    return winnaar


def _scores(conn, spot_id, grens):
    return conn.execute(
        """SELECT v.model, AVG(ABS(v.wind_speed - m.wind_speed)) AS mae, COUNT(*) AS n
           FROM voorspelling v JOIN meting m
             ON v.spot_id = m.spot_id AND v.voor_uur = m.meting_uur
           WHERE v.spot_id = ? AND v.voor_uur >= ?
           GROUP BY v.model
           HAVING n >= ?
           ORDER BY mae ASC""",
        (spot_id, grens, _MIN_PAREN),
    ).fetchall()
