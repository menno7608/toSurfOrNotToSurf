"""Widget-endpoint (/api/widget): klein antwoord per spot voor homescreen-widgets."""
from datetime import datetime, timezone

from conftest import TMP  # noqa: F401  (zet de testomgeving op)


def _zaai(mod, spot_id, wind_ms, gust_ms=None, richting=200):
    ts = datetime.now(timezone.utc)
    with mod._lock:
        mod._cache[(spot_id, "best_match")] = (
            {"id": spot_id, "live": {"windSpeed": wind_ms, "windGust": gust_ms, "windDir": richting},
             "utcOffset": 0, "updatedAt": ts.isoformat()}, ts)


def _live_leeg(mod):
    mod._br_cache.update(data=None, ts=None)
    mod._weather2kite_snapshot = None


def test_widget_geeft_kleine_respons_in_knopen(client, mod):
    _live_leeg(mod)
    _zaai(mod, "ameland", 10.0, 13.0, 350)
    r = client.get("/api/widget?spot=ameland")
    assert r.status_code == 200
    d = r.get_json()
    assert d["windKn"] == 19 and d["gustKn"] == 25 and d["dir"] == 350
    assert d["oordeel"] == "go"  # 10 m/s zit in 6-14 m/s
    assert d["url"].endswith("/mobile/?spot=ameland")
    assert len(r.data) < 1024
    assert r.headers["Cache-Control"] == "public, max-age=60"


def test_widget_oordeel_bijna_en_nee(client, mod):
    _live_leeg(mod)
    _zaai(mod, "ameland", 15.5)
    assert client.get("/api/widget?spot=ameland").get_json()["oordeel"] == "bijna"
    _zaai(mod, "ameland", 25.0)
    assert client.get("/api/widget?spot=ameland").get_json()["oordeel"] == "nee"


def test_widget_zonder_drempels_geen_oordeel(client, mod):
    _live_leeg(mod)
    zonder = next(m for m in mod.SPOTS_META if "min_wind" not in m)
    _zaai(mod, zonder["id"], 8.0)
    assert client.get(f"/api/widget?spot={zonder['id']}").get_json()["oordeel"] is None


def test_widget_onbekende_spot_en_lege_cache(client, mod):
    assert client.get("/api/widget?spot=bestaat-niet").status_code == 404
    with mod._lock:
        mod._cache.pop(("ameland", "best_match"), None)
    assert client.get("/api/widget?spot=ameland").status_code == 503


def test_aflandigheid_komt_overeen_met_de_frontend(mod):
    assert mod._aflandigheid(350, 350) == "ON SHORE"
    assert mod._aflandigheid(170, 350) == "OFF SHORE"
    assert mod._aflandigheid(80, 350) == "SIDE SHORE"
    assert mod._aflandigheid(None, 350) is None


def test_widget_tekstvariant_is_een_regel(client, mod):
    _live_leeg(mod)
    _zaai(mod, "ameland", 10.0, 13.0, 350)
    r = client.get("/api/widget?spot=ameland&format=text")
    assert r.status_code == 200 and r.mimetype == "text/plain"
    assert r.get_data(as_text=True) == "Ameland: 19 kn ↓ (vlagen 25) · GO"


def test_widget_spotlijst(client, mod):
    r = client.get("/api/widget-spots")
    d = r.get_json()
    assert r.status_code == 200 and len(d) == len(mod.SPOTS_META)
    assert set(d[0]) == {"id", "name"}
    assert [s["name"].lower() for s in d] == sorted(s["name"].lower() for s in d)
