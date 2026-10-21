"""Dekt de betrouwbaarheidsfixes van 20-10: best_match-horizon aanvullen,
KNMI-uurbereik, gemeten uren uit Buienradar, en dat leren de data nooit
tegenhoudt."""
import sqlite3
from datetime import datetime, timedelta, timezone

import leren


def test_horizon_vult_alleen_lege_uren_en_dagen_aan(mod):
    primair = {
        "hourly": {"time": ["d1T00:00", "d1T01:00", "d5T00:00"], "wind_speed_10m": [5.0, 6.0, None], "wind_direction_10m": [90, 90, None]},
        "daily": {"time": ["d1", "d5"], "wind_speed_10m_max": [8.0, None]},
    }
    aanvulling = {
        "hourly": {"time": ["d1T00:00", "d1T01:00", "d5T00:00"], "wind_speed_10m": [9.0, 9.0, 7.0], "wind_direction_10m": [180, 180, 200]},
        "daily": {"time": ["d1", "d5"], "wind_speed_10m_max": [12.0, 11.0]},
    }
    aangevuld = mod._vul_horizon_aan(primair, aanvulling)
    # Wat het geleerde model zelf heeft, blijft staan.
    assert primair["hourly"]["wind_speed_10m"][:2] == [5.0, 6.0]
    assert primair["daily"]["wind_speed_10m_max"][0] == 8.0
    # Daarna aangevuld, en die uren worden teruggemeld.
    assert primair["hourly"]["wind_speed_10m"][2] == 7.0
    assert primair["hourly"]["wind_direction_10m"][2] == 200
    assert primair["daily"]["wind_speed_10m_max"][1] == 11.0
    assert aangevuld == {"d5T00:00"}


def test_knmi_vraagt_hele_dagen(mod, monkeypatch):
    gevraagd = {}

    class Antwoord:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    def nep_get(url, params=None, **kw):
        gevraagd.update(params)
        return Antwoord()

    monkeypatch.setattr(mod.req, "get", nep_get)
    mod._fetch_knmi(330)
    # KNMI past HH per dag toe: alleen 01..24 geeft alle uren.
    assert gevraagd["start"].endswith("01") and len(gevraagd["start"]) == 10
    assert gevraagd["end"].endswith("24") and len(gevraagd["end"]) == 10


def test_metingen_geeft_snelheid_stoot_en_richting(mod):
    uur = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
    leren.leg_meting_vast("test-gemeten", uur, 6.5, 250.0, "buienradar", 9.1)
    m = leren.metingen("test-gemeten", uur - timedelta(hours=1))
    assert m[uur] == {"v": 6.5, "g": 9.1, "dir": 250.0, "bron": "buienradar"}


def test_schrijffout_in_leren_breekt_niets(monkeypatch):
    def kapot():
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(leren, "_verbind", kapot)
    uur = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    # Geen van deze mag een uitzondering doorlaten.
    leren.leg_voorspelling_vast("x", "gfs_seamless", [(uur, 5.0, 90)])
    leren.leg_meting_vast("x", uur, 5.0, 90, "buienradar")
    assert leren.metingen("x", uur) == {}
    leren._cache.pop("x", None)
    assert leren.beste_model("x", ["gfs_seamless"]) is None


def test_weather2kite_meting_wordt_vastgelegd(mod, monkeypatch):
    meta = next(m for m in mod.SPOTS_META if "weather2kite_spot" in m)
    nu = datetime.now(timezone.utc)
    monkeypatch.setattr(mod, "_weather2kite_snapshot",
                        (nu, {meta["weather2kite_spot"]: {"dt": nu, "v": 7.5, "g": 10.2, "dir": 240, "src": "w2k"}}))
    monkeypatch.setattr(mod, "_buienradar_stations", lambda: [])
    mod._leer_buienradar_metingen_vastleggen()
    uur = (nu + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
    m = leren.metingen(meta["id"], uur)
    assert m[uur]["bron"] == "weather2kite" and m[uur]["v"] == 7.5 and m[uur]["g"] == 10.2
