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
    assert d["lat"] == 53.447 and d["lon"] == 5.673
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


def test_widget_grafiek_reeksen(client, mod):
    _live_leeg(mod)
    ts = datetime.now(timezone.utc)
    nu = datetime.now().strftime("%Y-%m-%d")
    with mod._lock:
        mod._cache[("ameland", "best_match")] = ({
            "id": "ameland", "liveAt": f"{nu}T12:00", "utcOffset": 0,
            "live": {"windSpeed": 5.0, "windGust": 8.0, "windDir": 200},
            "windPast": [], "windLive": [],
            "windForecast": [{"date": nu, "t": "13:00", "v": 10.0, "g": 12.0, "dir": 250, "rain": 0.4},
                             {"date": nu, "t": "14:00", "v": 6.0, "g": None, "dir": 260, "rain": 0.0}],
            "marine": [{"date": nu, "t": "15:00", "hs": 1.2, "tp": 6.0, "tide": 0.3, "currentSpeed": 0.5}],
        }, ts)
    d = client.get("/api/widget-grafiek?spot=ameland").get_json()
    assert d["nowAt"] == f"{nu}T12:00"
    assert d["wind"][0] == {"t": f"{nu}T13:00", "kn": 19.4, "gust": 23.3, "dir": 250, "mm": 0.4}
    assert d["regen"][0]["mm"] == 0.4 and d["regen"][1]["mm"] == 0
    assert d["golven"] == [{"t": f"{nu}T15:00", "hs": 1.2, "tp": 6.0}]
    assert d["getij"][0]["m"] == 0.3 and d["stroom"][0]["kn"] == 0.5
    assert d["minKn"] == 11.7 and d["maxKn"] == 27.2  # 6-14 m/s
    assert client.get("/api/widget-grafiek?spot=bestaat-niet").status_code == 404


def test_widget_reden_bij_geen_go(client, mod):
    _live_leeg(mod)
    _zaai(mod, "ameland", 3.0)
    d = client.get("/api/widget?spot=ameland").get_json()
    assert d["oordeel"] == "nee" and d["reden"] == "te weinig wind"
    _zaai(mod, "ameland", 25.0)
    assert client.get("/api/widget?spot=ameland").get_json()["reden"] == "te veel wind"
    _zaai(mod, "ameland", 10.0)
    assert client.get("/api/widget?spot=ameland").get_json()["reden"] is None
