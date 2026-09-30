"""Gedrag dat de audit van 29-09 nodig bleek te hebben. Elke test hier dekt een
gemeten of in productie opgetreden fout."""
import gzip
import json
import time
from datetime import datetime, timedelta, timezone

import pytest

from conftest import TMP


def _zaai(mod, leeftijd=timedelta(minutes=1)):
    """Zet voor elke spot een minimale, verse best_match-entry in de cache."""
    ts = datetime.now(timezone.utc) - leeftijd
    with mod._lock:
        mod._cache.clear()
        for meta in mod.SPOTS_META:
            mod._cache[(meta["id"], "best_match")] = (
                {"id": meta["id"], "live": {"windSpeed": 5.0}, "utcOffset": 0}, ts)


def _live_leeg(mod):
    mod._br_cache.update(data=None, ts=None)
    mod._weather2kite_snapshot = None


def test_hangende_live_bronnen_houden_de_site_niet_op(client, mod):
    """Tot 29-09: /api/spots gaf na 300 s een 500 en /api/health wachtte 297 s
    (kopietest), in productie 14× WORKER TIMEOUT. Een hangende Buienradar of
    Weather2Kite mag een verzoek nu geen merkbare tijd meer kosten."""
    from conftest import NEP
    _zaai(mod)
    _live_leeg(mod)
    NEP.gedrag = {"buienradar": "hangt", "weather2kite": "hangt"}
    t = time.perf_counter()
    r = client.get("/api/spots")
    duur = time.perf_counter() - t
    assert r.status_code == 200
    assert len(r.get_json()) == len(mod.SPOTS_META)
    assert duur < 2, f"/api/spots duurde {duur:.1f}s met hangende live-bronnen"


def test_health_meldt_503_bij_verouderde_cache(client, mod):
    _zaai(mod, leeftijd=timedelta(hours=3))
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.get_json()["ok"] is False


def test_health_is_200_met_verse_cache_en_toont_details(client, mod):
    _zaai(mod)
    r = client.get("/api/health")
    body = r.get_json()
    assert r.status_code == 200 and body["ok"] is True
    assert body["spots"] == len(mod.SPOTS_META)
    assert body["cache_nieuwste_s"] < 120
    assert set(body["live"]) == {"buienradar", "weather2kite"}


def test_api_spots_wordt_gecomprimeerd(client, mod):
    _zaai(mod)
    r = client.get("/api/spots", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("Content-Encoding") == "gzip"
    assert json.loads(gzip.decompress(r.data))[0]["id"]
    kaal = client.get("/api/spots")
    assert "Content-Encoding" not in kaal.headers


def test_cache_wordt_atomair_geschreven(mod, monkeypatch):
    """Een crash tijdens het schrijven mag de vorige cache niet beschadigen."""
    _zaai(mod)
    pad = mod._DISK_CACHE
    assert str(TMP) in pad, "test mag nooit de productiecache raken"
    with open(pad, "w") as f:
        f.write('{"heel": true}')

    def kapot(obj, f, *a, **kw):
        f.write('{"half')
        raise RuntimeError("crash tijdens schrijven")

    monkeypatch.setattr(mod._json, "dump", kapot)
    mod._save_disk_cache()
    assert json.load(open(pad)) == {"heel": True}


def test_toeganglog_bewaart_geen_ip(client, mod):
    _zaai(mod)
    ip = "203.0.113.77"
    client.get("/api/spots", headers={"CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0"})
    client.get("/api/spots", headers={"CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0"})
    logs = list((TMP / "toegang").glob("toegang-*.jsonl"))
    assert logs, "geen toeganglog geschreven"
    inhoud = logs[0].read_text()
    assert ip not in inhoud
    regels = [json.loads(r) for r in inhoud.splitlines() if '"/api/spots"' in r]
    assert regels[-1]["bezoeker"] == regels[-2]["bezoeker"]   # zelfde dag, zelfde bezoeker
    assert regels[-1]["soort"] == "browser" and regels[-1]["status"] == 200
    assert oct(logs[0].stat().st_mode & 0o777) == "0o600"


def test_beveiligingsheaders(client):
    r = client.get("/api/health")
    for kop in ("X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options",
                "Strict-Transport-Security"):
        assert kop in r.headers
