# ~/Documents/raspberry-weather-screen/backend/app.py

from flask import Flask, jsonify, render_template, request, send_from_directory, redirect
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading, os, math, json
import requests as req
import knmi_harmonie as harmonie
import leren

app = Flask(__name__, static_folder="static", template_folder="templates")
import webwacht
webwacht.installeer(app)

# Gebouwde React-app serveren (na `npm run build`)
REACT_BUILD     = os.path.join(os.path.dirname(__file__), "static", "app")
REACT_DEV_BUILD = os.path.join(os.path.dirname(__file__), "static", "app-dev")
REACT_MOBILE_BUILD = os.path.join(os.path.dirname(__file__), "static", "app-mobile")


URL_FILE = os.path.join(os.path.dirname(__file__), "..", "URL.txt")

@app.route("/go")
def go():
    try:
        url = open(URL_FILE).read().strip()
        if url:
            return redirect(url)
    except Exception:
        pass
    return "Tunnel URL niet beschikbaar. Controleer URL.txt.", 503

# Archimedes OS — twee statische pagina's op dit domein (11-09-2026).
# Google's OAuth-consent voor een *restricted* scope (gmail.readonly) eist een
# Application home page en een Privacy policy link op een geverifieerd domein;
# zonder die twee blijft "Publish app" grijs en vervalt elk refresh-token na
# zeven dagen. Ze staan hier omdat dit domein al van de eigenaar is en al draait.
# Bewust vóór de catch-all hieronder gezet voor de leesbaarheid; Werkzeug kiest
# sowieso de exacte regel boven `/<path:path>`.
@app.route("/privacy")
def archimedes_privacy():
    return render_template("archimedes_privacy.html")


@app.route("/archimedes")
def archimedes_home():
    return render_template("archimedes_home.html")


@app.route("/dev/", defaults={"path": ""})
@app.route("/dev/<path:path>")
def serve_dev_app(path):
    if not os.path.exists(REACT_DEV_BUILD):
        return "Dev build niet beschikbaar. Voer eerst 'npm run build:dev' uit.", 503
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    full = os.path.join(REACT_DEV_BUILD, path)
    if path and os.path.exists(full):
        return send_from_directory(REACT_DEV_BUILD, path)
    return send_from_directory(REACT_DEV_BUILD, "index.html")

@app.route("/mobile/", defaults={"path": ""})
@app.route("/mobile/<path:path>")
def serve_mobile_app(path):
    if not os.path.exists(REACT_MOBILE_BUILD):
        return "Mobiele build niet beschikbaar. Voer eerst 'npm run build:mobile' uit.", 503
    full = os.path.join(REACT_MOBILE_BUILD, path)
    if path and os.path.isfile(full):
        resp = send_from_directory(REACT_MOBILE_BUILD, path)
        if path == "service-worker.js":
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return resp
    resp = send_from_directory(REACT_MOBILE_BUILD, "mobile.html")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_app(path):
    # API-routes worden afgehandeld door eigen endpoints
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    full = os.path.join(REACT_BUILD, path)
    if path and os.path.exists(full):
        return send_from_directory(REACT_BUILD, path)
    # index.html nooit cachen zodat nieuwe builds direct zichtbaar zijn
    resp = send_from_directory(REACT_BUILD, "index.html")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp

# ── Spot metadata (geladen vanuit spots.json — één bron van truth) ─────────────
import json as _json
from dotenv import load_dotenv
load_dotenv()
KNMI_API_KEY = os.getenv("KNMI_API_KEY", "")

_SPOTS_PATH = os.path.join(os.path.dirname(__file__), "spots.json")
try:
    SPOTS_META = sorted(_json.load(open(_SPOTS_PATH)), key=lambda s: s["name"].lower())
except FileNotFoundError:
    raise SystemExit(f"[FATAL] spots.json niet gevonden op {_SPOTS_PATH}")
except Exception as _e:
    raise SystemExit(f"[FATAL] spots.json laden mislukt: {_e}")

# ── Harmonie-data (gedeelde fetch voor alle NL-spots tegelijk) ─────────────────
_harmonie_data: dict = {}
_harmonie_lock = threading.Lock()
_harmonie_ts: datetime | None = None
_HARMONIE_TTL = timedelta(hours=1)


def _get_harmonie_data() -> dict:
    """Geeft gecachede Harmonie-data terug; herlaadt als verlopen."""
    global _harmonie_data, _harmonie_ts
    if not KNMI_API_KEY:
        return {}
    with _harmonie_lock:
        now = datetime.now(timezone.utc)
        if _harmonie_ts is None or now - _harmonie_ts > _HARMONIE_TTL:
            try:
                _harmonie_data = harmonie.fetch_all_nl_spots(SPOTS_META, KNMI_API_KEY)
                _harmonie_ts = now
            except Exception as e:
                print(f"[WARN] Harmonie refresh mislukt: {e}")
        return _harmonie_data

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache: dict = {}
_lock         = threading.Lock()
CACHE_TTL     = timedelta(minutes=30)
# Instelbaar zodat tests en kopieën nooit de productiecache overschrijven.
_DISK_CACHE   = os.environ.get("WEERCACHE_PAD") or os.path.join(os.path.dirname(__file__), "cache.json")


def _load_disk_cache():
    """Laad cache van schijf bij opstarten zodat stale data direct beschikbaar is."""
    try:
        with open(_DISK_CACHE) as f:
            raw = _json.load(f)
        for k_str, entry in raw.items():
            spot_id, model = k_str.split("|", 1)
            ts = datetime.fromisoformat(entry["ts"]).replace(tzinfo=timezone.utc)
            _cache[(spot_id, model)] = (entry["data"], ts)
        print(f"[INFO] Disk cache geladen: {len(_cache)} spots")
    except Exception:
        pass


def _save_disk_cache():
    """Sla huidige cache op naar schijf (overschrijft vorige versie)."""
    try:
        with _lock:
            snapshot = dict(_cache)  # snelle kopie, lock direct vrijgeven
        raw = {
            f"{k[0]}|{k[1]}": {"data": v[0], "ts": v[1].isoformat()}
            for k, v in snapshot.items()
        }
        # Eerst naar een tijdelijk bestand, dan in één stap vervangen: een crash
        # halverwege laat zo de vorige cache heel in plaats van een halve.
        tijdelijk = _DISK_CACHE + ".tmp"
        with open(tijdelijk, "w") as f:
            _json.dump(raw, f)
        os.replace(tijdelijk, _DISK_CACHE)
    except Exception as e:
        print(f"[WARN] Disk cache opslaan mislukt: {e}")


# Bovengrens op wat er nog uit de cache mag komen. Ruim boven CACHE_TTL, zodat
# een hapering bij Open-Meteo niet meteen een leeg scherm oplevert, maar ver
# onder de dag: een verwachting van gisteren is niet als oud te herkennen in de
# grafiek en dus misleidend.
_MAX_SERVE_AGE = timedelta(hours=6)


def _cache_get(key, allow_stale=False):
    with _lock:
        entry = _cache.get(key)
        if entry:
            data, ts = entry
            if datetime.now(timezone.utc) - ts < CACHE_TTL:
                return data, False   # (data, is_stale)
            if allow_stale:
                return data, True
    return None, False


def _cache_leeftijd(key) -> timedelta:
    """Hoe oud staat dit in de cache? timedelta.max als het er niet in staat."""
    with _lock:
        entry = _cache.get(key)
        if not entry:
            return timedelta.max
        return datetime.now(timezone.utc) - entry[1]


def _cache_set(key, data):
    with _lock:
        _cache[key] = (data, datetime.now(timezone.utc))


_load_disk_cache()


# ── Live-metingen (Buienradar, Weather2Kite) ─────────────────────────────────
# Tot 29-09 werden deze twee bronnen binnen het verzoek aangeroepen, per spot en
# zonder negatieve cache. Hing één van beide, dan betaalde elke spot de volle
# time-out en wachtte de (enige) worker tot gunicorn hem na 300 s doodde: de hele
# site plat, ook /api/health. Gemeten op een kopie (audit 29-09) en in productie
# 14× gebeurd (16-08, 31-08, 01-09). Nu ververst alleen een achtergrondthread
# (_live_verversen) deze bronnen; het verzoek leest uitsluitend de snapshot.
_LIVE_TIMEOUT      = 4                       # seconden per externe call
_LIVE_INTERVAL     = 60                      # hoe vaak de thread kijkt
_LIVE_MAX_LEEFTIJD = timedelta(minutes=30)   # oudere snapshot telt niet als live
_live_status: dict = {
    "buienradar":   {"ok_ts": None, "fout": None, "fout_ts": None},
    "weather2kite": {"ok_ts": None, "fout": None, "fout_ts": None},
}

_br_cache: dict = {"data": None, "ts": None}
_br_lock = threading.Lock()

def _fetch_buienradar() -> list:
    with _br_lock:
        if _br_cache["data"] and _br_cache["ts"]:
            if datetime.now(timezone.utc) - _br_cache["ts"] < timedelta(minutes=10):
                return _br_cache["data"]
        # HTTP call binnen de lock zodat slechts één thread tegelijk fetcht
        r = req.get("https://data.buienradar.nl/2.0/feed/json", timeout=_LIVE_TIMEOUT)
        r.raise_for_status()
        stations = r.json().get("actual", {}).get("stationmeasurements", [])
        _br_cache["data"] = stations
        _br_cache["ts"]   = datetime.now(timezone.utc)
        return stations


_BR_MAX_DIST = 1.5  # graden (~165 km) — alleen NL/aangrenzende spots

def _nearest_br_station(lat: float, lon: float, stations: list) -> dict | None:
    best, best_d = None, float("inf")
    for s in stations:
        slat = s.get("lat") or s.get("latitude")
        slon = s.get("lon") or s.get("longitude")
        if slat is None or slon is None:
            continue
        d = math.sqrt((lat - slat) ** 2 + (lon - slon) ** 2)
        if d < best_d:
            best_d, best = d, s
    return best if best_d <= _BR_MAX_DIST else None


# Max 3 gelijktijdige Open-Meteo calls om rate limiting te voorkomen
_om_semaphore = threading.Semaphore(3)

# ── Open-Meteo fetch (hourly + daily in één request) ──────────────────────────
# Dekkingsgebied van KNMI Harmonie-Arome, ruim genomen. Buiten dit gebied
# antwoordt Open-Meteo met HTTP 200 en `"latitude":nan` — geen geldige JSON, dus
# dat liep uit op een parse-fout, een tweede verzoek voor best_match en een
# gebruiker die zonder melding een ander model te zien kreeg. Nu wordt het
# verzoek niet meer gedaan.
_HARMONIE_BBOX = (43.0, 64.0, -12.0, 22.0)  # lat_min, lat_max, lon_min, lon_max


def _model_dekt(lat: float, lon: float, model: str) -> bool:
    if model != "knmi_harmonie_arome_europe":
        return True
    lat_min, lat_max, lon_min, lon_max = _HARMONIE_BBOX
    return lat_min <= lat <= lat_max and lon_min <= lon <= lon_max


def _fetch_weather(lat, lon, model):
    if not _model_dekt(lat, lon, model):
        return None
    with _om_semaphore:
        r = req.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": lat, "longitude": lon,
            "hourly":   "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,apparent_temperature,weathercode,precipitation",
            "daily":    "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weathercode,temperature_2m_max,temperature_2m_min",
            # Een volle dag terug in plaats van twaalf uur: de dagenstrip toont
            # gisteren, en dan moet de grafiek daar ook heen kunnen scrollen.
            "past_days": 1,
            "forecast_days": 7,
            "wind_speed_unit": "ms",
            "timezone": "auto",
            "models":   model,
        }, timeout=15)
        r.raise_for_status()
        return r.json()


def _vul_horizon_aan(primair: dict, aanvulling: dict) -> set:
    """Vult de lege uren en dagen van `primair` (het geleerde best_match-model)
    met `aanvulling` (Open-Meteo's eigen best_match), per tijdstempel.

    Waarom: het geleerde model is vaak Météo-France of Harmonie, en die reiken
    maar 2-4 dagen vooruit. Zonder aanvulling stopte "best match" bij zulke
    spots midden in de week en stonden de laatste dagen leeg (20-10). Wat het
    geleerde model wél heeft, blijft staan. Geeft de aangevulde uren terug,
    zodat die niet onder de naam van het geleerde model geleerd worden."""
    aangevuld = set()
    for blok in ("hourly", "daily"):
        p, a = primair.get(blok), aanvulling.get(blok)
        if not p or not a:
            continue
        index = {t: i for i, t in enumerate(a.get("time", []))}
        for i, t in enumerate(p.get("time", [])):
            j = index.get(t)
            if j is None:
                continue
            for sleutel, waarden in p.items():
                if sleutel == "time" or i >= len(waarden) or waarden[i] is not None:
                    continue
                bron = a.get(sleutel)
                if bron and j < len(bron) and bron[j] is not None:
                    waarden[i] = bron[j]
                    if blok == "hourly":
                        aangevuld.add(t)
    return aangevuld


# ── MET Norway fallback (gratis, geen key, wereldwijd) ────────────────────────
# MET Norway eist een User-Agent met een echt contactadres en beantwoordt alles
# met een voorbeeldadres met 403. Er stond `contact@example.com`, waardoor deze
# fallback nooit gewerkt heeft — hij sprong pas in als Open-Meteo eruit lag, en
# gaf dan zelf ook niets. Het adres staat in .env omdat deze repo openbaar is.
_MET_CONTACT = os.getenv("MET_CONTACT", "").strip()
_MET_UA = f"toSurfOrNotToSurf/1.0 {_MET_CONTACT}" if _MET_CONTACT else ""


def _fetch_met_norway(lat, lon):
    if not _MET_UA:
        raise RuntimeError("MET_CONTACT niet gezet in .env — MET Norway zou 403 geven")
    r = req.get(
        "https://api.met.no/weatherapi/locationforecast/2.0/compact",
        params={"lat": round(lat, 4), "lon": round(lon, 4)},
        headers={"User-Agent": _MET_UA},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _parse_met_norway(data: dict) -> dict:
    """Zet MET Norway response om naar Open-Meteo-achtig formaat."""
    # MET Norway symbol_code → WMO weather code (benadering)
    _MET_TO_WMO = {
        "clearsky":          0,  "fair":              1,
        "partlycloudy":      2,  "cloudy":            3,
        "fog":              45,  "lightrain":        51,
        "rain":             61,  "heavyrain":        65,
        "lightrainshowers": 80,  "rainshowers":      81,  "heavyrainshowers": 82,
        "lightsleet":       66,  "sleet":            67,
        "lightsnow":        71,  "snow":             73,  "heavysnow":        75,
        "lightsnowshowers": 85,  "snowshowers":      86,
        "thunder":          95,  "lightrainandthunder": 95,
        "rainandthunder":   95,  "heavyrainandthunder": 99,
        "hail":             96,
    }

    def _symbol_to_wmo(symbol: str | None) -> int | None:
        if not symbol:
            return None
        base = symbol.replace("_day", "").replace("_night", "").replace("_polartwilight", "")
        return _MET_TO_WMO.get(base)

    times, speeds, gusts, dirs, temps, feels, wcodes = [], [], [], [], [], [], []
    for entry in data.get("properties", {}).get("timeseries", []):
        t = entry["time"].replace("Z", "")  # "2026-04-07T09:00:00" → strip Z
        inst = entry.get("data", {}).get("instant", {}).get("details", {})
        speed = inst.get("wind_speed")
        direction = inst.get("wind_from_direction")
        temp = inst.get("air_temperature")
        gust = inst.get("wind_speed_of_gust")
        if speed is None:
            continue
        # Weersymbool uit next_1_hours of next_6_hours
        symbol = (
            entry.get("data", {}).get("next_1_hours", {}).get("summary", {}).get("symbol_code")
            or entry.get("data", {}).get("next_6_hours", {}).get("summary", {}).get("symbol_code")
        )
        times.append(t[:16])  # "2026-04-07T09:00"
        speeds.append(speed)
        gusts.append(gust)
        dirs.append(direction)
        temps.append(temp)
        feels.append(None)
        wcodes.append(_symbol_to_wmo(symbol))
    return {
        "hourly": {
            "time":                 times,
            "wind_speed_10m":       speeds,
            "wind_gusts_10m":       gusts,
            "wind_direction_10m":   dirs,
            "temperature_2m":       temps,
            "apparent_temperature": feels,
            "weathercode":          wcodes,
        },
        "daily": None,  # geen dagverwachting in MET Norway compact
    }


def _wave_power_kj(hs, tp) -> float | None:
    """Golfvermogen-index E ≈ 10 · Hs² · Tp, kalibratie tegen de schaal die
    surf-apps hanteren (Surf-Forecast: ~100 kJ net surfbaar, 200-1000 kJ
    stevig). De 'echte' natuurkundige golfvermogenformule (ρg²Hs²Tp/64π,
    coëfficiënt ~0,5 kW/m) ligt een factor ~20 lager dan wat die apps tonen;
    deze constante is empirisch teruggerekend uit Essaouira-cijfers zodat
    onze schaal met die apps overeenkomt, niet een SI-eenheid."""
    if hs is None or tp is None:
        return None
    return 10 * (hs ** 2) * tp


def _fetch_marine(lat, lon):
    with _om_semaphore:
        r = req.get("https://marine-api.open-meteo.com/v1/marine", params={
            "latitude": lat, "longitude": lon,
            "hourly": (
                "wave_height,wave_period,wave_direction,"
                "swell_wave_height,swell_wave_period,swell_wave_direction,"
                "wind_wave_height,wind_wave_period,"
                "sea_surface_temperature,"
                "ocean_current_velocity,ocean_current_direction,"
                "sea_level_height_msl"
            ),
            # Zelfde terugblik als de winddata, anders lopen golven en wind niet
            # gelijk op zodra je een dag terug kijkt. Hier `past_hours` en geen
            # `past_days`: naast `forecast_hours` negeert de marine-API die.
            "past_hours": 24, "forecast_hours": 240,
            "timezone": "auto",
        }, timeout=15)
        r.raise_for_status()
        return r.json()


# ── KNMI uurgegevens (gemeten, station 330 = Hoek van Holland) ─────────────────
def _fetch_knmi(station_nr: int, hours: int = 96) -> list:
    """
    Haalt gemeten uurlijkse winddata op van een KNMI-station.
    Station 330 = Hoek van Holland (dichtstbij Scheveningen aan de kust).
    Variabelen: FH = uurgemiddelde wind (0.1 m/s), FX = windstoot (0.1 m/s), DD = richting.

    `hours=48` i.p.v. de oorspronkelijke 14: KNMI publiceert deze reeks met
    vertraging (de laatste 10-15 uur komen leeg terug), dus bij 14 uur bleef er
    vaak niets bruikbaars over. `_build_spot` gebruikt toch alleen wat vóór het
    huidige uur ligt, dus de extra historie kost niets aan actualiteit.
    """
    # KNMI past het uurbereik (HH in start/end) per dag toe, niet als één
    # doorlopende periode: start ...19 en end ...19 gaf één uur per dag terug
    # (gemeten 20-10). Dus hele dagen vragen, 01 t/m 24. Deze reeks loopt
    # bovendien ±2 dagen achter; recente uren komen uit Buienradar (leren.metingen).
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(hours=hours)).strftime("%Y%m%d") + "01"
    end   = now.strftime("%Y%m%d") + "24"

    r = req.get(
        "https://www.daggegevens.knmi.nl/klimatologie/uurgegevens",
        params={"stns": station_nr, "vars": "FH:FX:DD", "start": start, "end": end, "fmt": "json"},
        timeout=12,
    )
    r.raise_for_status()
    rows = r.json()

    result = []
    for row in rows:
        # KNMI leverde hier ooit STN/YYYYMMDD/HH; de json-feed geeft nu
        # station_code/date/hour (date = de dag om 00:00 UTC, hour = 1-24,
        # zelfde "HH=1 is 00:00-01:00"-conventie als voorheen). Beide vormen
        # opvangen zodat een volgende stille KNMI-wijziging niet opnieuw een
        # kale except-tak oplevert.
        if "hour" in row:
            dag = datetime.fromisoformat(row["date"].replace("Z", "+00:00"))
            hh = int(row["hour"])
            fh, fx, dd = row.get("FH"), row.get("FX"), row.get("DD")
        else:
            yyyymmdd = str(row["YYYYMMDD"])
            dag = datetime(int(yyyymmdd[:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:]), tzinfo=timezone.utc)
            hh = int(row["HH"])
            fh, fx, dd = row.get("FH"), row.get("FX"), row.get("DD")

        if fh is None:
            continue
        # Zelfde opbouw als voorheen: HH=1 = uur 00:00-01:00; bij HH=24 schuift
        # KNMI's eigen datumlabel een dag door (ongewijzigd gedrag, niet hier onderzocht).
        dt = dag.replace(hour=(hh - 1) % 24, minute=0, second=0, microsecond=0)
        if hh == 24:
            dt += timedelta(days=1)

        result.append({
            "dt":  dt,
            "t":   dt.strftime("%H:%M"),
            "v":   round(fh / 10, 1),
            "g":   round(fx / 10, 1) if fx is not None else None,
            "dir": int(dd) if dd is not None else None,
            "src": "knmi",
        })

    return result


_weather2kite_snapshot: tuple[datetime, dict[int, dict]] | None = None
_WEATHER2KITE_TTL = timedelta(minutes=5)
# Metingen ouder dan dit tellen niet meer als "live"; het station staat dan stil.
_WEATHER2KITE_MAX_AGE = timedelta(minutes=35)


def _fetch_weather2kite_all() -> dict[int, dict]:
    """Laatste 10-minutenmeting van álle Weather2Kite-stations, per spot_id.

    De API geeft zonder `spot_id`-parameter in één antwoord alle stations terug.
    Dat scheelt tientallen verzoeken per ronde — met een meetstation per spot zou
    het anders om één verzoek per spot per vijf minuten gaan, en dat is zowel
    traag voor ons als onbeleefd tegenover een gratis bron.

    Eén rij per grootheid per station, dus rijen worden op spot_id gegroepeerd.
    """
    global _weather2kite_snapshot
    now = datetime.now(timezone.utc)
    if _weather2kite_snapshot and now - _weather2kite_snapshot[0] < _WEATHER2KITE_TTL:
        return _weather2kite_snapshot[1]

    r = req.get(
        "https://www.weather2kite.nl/sc/scapi.php",
        params={"table": "mv_spotwind"},
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; toSurfOrNotToSurf/1.0)",
            "Referer": "https://www.weather2kite.nl/web/spotinfo",
        },
        timeout=_LIVE_TIMEOUT,
    )
    r.raise_for_status()

    per_spot: dict[int, dict] = {}
    for row in r.json():
        spot_id = row.get("spot_id")
        if spot_id is None:
            continue
        entry = per_spot.setdefault(spot_id, {"dt": None, "v": None, "g": None,
                                              "dir": None, "src": "w2k"})
        name  = row.get("et_name")
        value = row.get("evalue")
        units = row.get("units")
        if name == "Windsnelheid" and units == "m/s":
            entry["v"] = value
        elif name == "Windstoot" and units == "m/s":
            entry["g"] = value
        elif name == "Windrichting":
            entry["dir"] = value
        # De rest van de app rekent in m/s (Open-Meteo staat op wind_speed_unit=ms,
        # Buienradar levert m/s). Een station dat in knopen rapporteert wordt
        # daarom overgeslagen in plaats van stilzwijgend fout ingelezen.
        if row.get("etime"):
            entry["dt"] = datetime.fromtimestamp(row["etime"], timezone.utc)

    fresh = {
        spot_id: entry
        for spot_id, entry in per_spot.items()
        if entry["v"] is not None and entry["dt"] is not None
        and now - entry["dt"] <= _WEATHER2KITE_MAX_AGE
    }
    _weather2kite_snapshot = (now, fresh)
    return fresh


def _weather2kite_live(spot_id: int) -> dict | None:
    """Laatste lokale meting voor één Weather2Kite-station, uit de snapshot.

    Doet nooit zelf een verzoek; zie `_live_verversen`."""
    snap = _weather2kite_snapshot
    if not snap or datetime.now(timezone.utc) - snap[0] > _LIVE_MAX_LEEFTIJD:
        return None
    return snap[1].get(spot_id)


def _buienradar_stations() -> list:
    """Buienradar-stations uit de snapshot; leeg als die te oud is of ontbreekt."""
    ts = _br_cache["ts"]
    if not ts or datetime.now(timezone.utc) - ts > _LIVE_MAX_LEEFTIJD:
        return []
    return _br_cache["data"] or []


def _live_ververs_een(naam: str, fetch) -> None:
    status = _live_status[naam]
    try:
        fetch()
        status["ok_ts"], status["fout"] = datetime.now(timezone.utc), None
    except Exception as e:
        status["fout"], status["fout_ts"] = str(e)[:200], datetime.now(timezone.utc)
        print(f"[WARN] live {naam}: {e}")


def _leer_buienradar_metingen_vastleggen() -> None:
    """Eén keer per minuut vanuit _live_verversen — niet per request, want
    _apply_buienradar draait op elk verzoek en mag niet bij elke pageview naar
    sqlite schrijven. Voor elke spot zonder weather2kite-voorrang de
    dichtstbijzijnde Buienradar-meting vastleggen onder het huidige uur, als
    grondwaarheid voor leren.beste_model.

    Sinds 20-10 ook Weather2Kite voor de spots die dat als live-bron hebben
    (24 spots, waaronder Scheveningen en IJmuiden): daarvan werd niets bewaard,
    dus hun "Measured"-lijn was altijd modeldata. En onder het dichtstbijzijnde
    hele uur in plaats van het lopende: een meting van 20:55 hoort bij 21:00,
    het moment waarop het model zijn uurwaarde geeft."""
    stations = _buienradar_stations()
    w2k = _weather2kite_snapshot[1] if _weather2kite_snapshot else {}
    uur = (datetime.now(timezone.utc) + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
    for meta in SPOTS_META:
        if "weather2kite_spot" in meta:
            m = w2k.get(meta["weather2kite_spot"])
            if m and m.get("v") is not None:
                leren.leg_meting_vast(meta["id"], uur, float(m["v"]), m.get("dir"), "weather2kite", m.get("g"))
            continue
        if not stations:
            continue
        br = _nearest_br_station(meta["lat"], meta["lon"], stations)
        if not br:
            continue
        ws = br.get("windspeed")
        if ws is None:
            continue
        wd = br.get("winddirectiondegrees")
        wg = br.get("windgusts")
        try:
            leren.leg_meting_vast(meta["id"], uur, float(ws), float(wd) if wd is not None else None, "buienradar",
                                  float(wg) if wg is not None else None)
        except Exception as e:
            print(f"[WARN] leren buienradar {meta['id']}: {e}")


def _live_verversen() -> None:
    """Achtergrondthread: houdt beide live-snapshots vers.

    De fetches hebben hun eigen TTL (Buienradar 10 min, W2K 5 min), dus elke
    minuut kijken kost alleen een verzoek als de snapshot verlopen is. Een
    mislukte poging wordt na één interval opnieuw geprobeerd: dat ís de
    negatieve cache, en hij kost geen bezoeker ooit wachttijd."""
    import time
    while True:
        _live_ververs_een("buienradar", _fetch_buienradar)
        _leer_buienradar_metingen_vastleggen()
        _live_ververs_een("weather2kite", _fetch_weather2kite_all)
        time.sleep(_LIVE_INTERVAL)


def _parse_time(ts: str) -> datetime:
    return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)


def _pts_to_local(points: list, utc_offset: int) -> list:
    """Converteer 't' en 'date' velden van UTC naar lokale spottime."""
    result = []
    for p in points:
        utc_dt = datetime.fromisoformat(f"{p['date']}T{p['t']}").replace(tzinfo=timezone.utc)
        local_dt = utc_dt + timedelta(seconds=utc_offset)
        result.append({**p, "t": local_dt.strftime("%H:%M"), "date": local_dt.strftime("%Y-%m-%d")})
    return result




# ── Spot samenstellen ──────────────────────────────────────────────────────────
def _build_spot(meta: dict, model: str, harmonie_data: dict | None = None) -> dict | None:
    now_h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    is_nl = harmonie_data is not None and harmonie.is_nl_spot(meta["lat"], meta["lon"])

    # Model dekt deze plek niet: meteen opgeven, zodat _get_spot terugvalt op
    # best_match. Doorgaan naar de MET Norway-fallback zou hier verkeerd zijn —
    # dan kreeg de gebruiker een wereldwijd model onder de naam van het model
    # dat hij koos.
    if not _model_dekt(meta["lat"], meta["lon"], model):
        print(f"[INFO] {meta['id']}: model '{model}' dekt deze locatie niet")
        return None

    # best_match: niet blind Open-Meteo's eigen blend volgen als we op deze
    # plek al weten welk model het dichtst bij de meting zit. Alleen spots met
    # een meetbron (KNMI vlakbij, of binnen Buienradar-bereik) krijgen hier
    # ooit een winnaar; de rest valt vanzelf terug op gewoon gedrag.
    model_om_op_te_halen = model
    if model == "best_match":
        kandidaten = [m for m in _WARM_MODELS[1:] if _model_dekt(meta["lat"], meta["lon"], m)]
        geleerd = leren.beste_model(meta["id"], kandidaten)
        if geleerd:
            model_om_op_te_halen = geleerd

    # ── Weerdata ophalen: Open-Meteo → MET Norway fallback ───────────────────
    weather = None
    try:
        weather = _fetch_weather(meta["lat"], meta["lon"], model_om_op_te_halen)
    except Exception as e:
        print(f"[WARN] Open-Meteo {meta['id']}: {e}")
    van_open_meteo = weather is not None  # MET Norway hieronder is een ander model; niet als dit model vastleggen

    aangevuld = set()
    if weather is not None and model_om_op_te_halen != model:
        speeds = weather.get("hourly", {}).get("wind_speed_10m", [])
        if any(v is None for v in speeds):
            try:
                aanvulling = _fetch_weather(meta["lat"], meta["lon"], "best_match")
                if aanvulling:
                    aangevuld = _vul_horizon_aan(weather, aanvulling)
            except Exception as e:
                print(f"[WARN] aanvulling best_match {meta['id']}: {e}")

    if weather is None:
        try:
            met_raw = _fetch_met_norway(meta["lat"], meta["lon"])
            weather = _parse_met_norway(met_raw)
            print(f"[INFO] {meta['id']}: MET Norway fallback")
        except Exception as e:
            print(f"[WARN] MET Norway {meta['id']}: {e}")

    if weather is None and not is_nl:
        return None  # geen data en geen KNMI-alternatief

    try:
        marine_raw = _fetch_marine(meta["lat"], meta["lon"])
    except Exception as e:
        print(f"[WARN] marine {meta['id']}: {e}")
        marine_raw = None

    # ── UTC-offset voor lokale spottime ──────────────────────────────────────
    # Open-Meteo met timezone:auto geeft utc_offset_seconds terug.
    # MET Norway-fallback heeft dit niet → probeer marine als alternatief.
    weather_local = isinstance(weather, dict) and "utc_offset_seconds" in weather
    utc_offset = 0
    if weather_local:
        utc_offset = int(weather.get("utc_offset_seconds", 0))
    elif isinstance(marine_raw, dict) and "utc_offset_seconds" in marine_raw:
        utc_offset = int(marine_raw.get("utc_offset_seconds", 0))

    # daily zit ingebakken in Open-Meteo response (None bij MET Norway)
    daily_raw = weather

    # ── KNMI gemeten data voor stations met een stn-nummer ───────────────────
    knmi_by_dt: dict = {}
    if "knmi_stn" in meta:
        try:
            knmi_rows = _fetch_knmi(meta["knmi_stn"])
            for row in knmi_rows:
                knmi_by_dt[row["dt"]] = row
            # Dit is meteen de enige meetbron hier met écht uurhistorie (niet
            # alleen "nu") — rechtstreeks bruikbaar voor leren.beste_model.
            for row in knmi_rows:
                leren.leg_meting_vast(meta["id"], row["dt"], row["v"], row["dir"], "knmi")
        except Exception as e:
            print(f"[WARN] KNMI {meta['id']}: {e}")

    # Recente uren: eigen vastgelegde Buienradar-metingen van het dichtstbijzijnde
    # station. KNMI's uurreeks loopt ±2 dagen achter, dus zonder dit was de hele
    # "Measured"-lijn modeldata (20-10: 2959 van 2959 punten).
    gemeten = {u: m for u, m in leren.metingen(meta["id"], now_h - timedelta(days=2)).items()
               if m["bron"] in ("buienradar", "weather2kite") and m["v"] is not None}

    # ── Wind verwerken ───────────────────────────────────────────────────────
    wind_past, wind_live, wind_forecast = [], [], []
    live_speed = live_gust = live_dir = None
    live_temp = live_feels = live_wcode = None

    # Open-Meteo verwerken als beschikbaar (geeft past + forecast)
    if weather:
        h      = weather["hourly"]
        times  = h["time"]
        speeds = h["wind_speed_10m"]
        gusts  = h["wind_gusts_10m"]
        dirs   = h["wind_direction_10m"]
        temps  = h.get("temperature_2m", [])
        feels  = h.get("apparent_temperature", [])
        wcodes = h.get("weathercode", [])
        precip = h.get("precipitation", [])
        voorspelling_snapshot = []  # (voor_uur UTC, wind_speed, wind_dir) — ongemoeid door de KNMI-vervanging hieronder

        for i, ts in enumerate(times):
            # Open-Meteo timezone:auto → lokale tijd; MET Norway → UTC
            if weather_local:
                t_utc     = (datetime.fromisoformat(ts) - timedelta(seconds=utc_offset)).replace(tzinfo=timezone.utc)
                local_str = ts  # bijv. "2026-04-16T16:00"
            else:
                t_utc     = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
                local_dt  = t_utc + timedelta(seconds=utc_offset)
                local_str = local_dt.strftime("%Y-%m-%dT%H:%M")

            v = speeds[i]
            if v is None:
                continue

            g = gusts[i]
            d = dirs[i]
            if van_open_meteo and ts not in aangevuld:
                voorspelling_snapshot.append((t_utc, speeds[i], dirs[i]))

            # Vervang door KNMI-meting als beschikbaar (alleen verleden)
            knmi = knmi_by_dt.get(t_utc)
            br_m = gemeten.get(t_utc)
            if knmi and t_utc < now_h:
                v   = knmi["v"]
                g   = knmi["g"]
                d   = knmi["dir"] if knmi["dir"] else d
                src = "knmi"
            elif br_m and t_utc < now_h:
                v   = br_m["v"]
                g   = br_m["g"]
                d   = br_m["dir"] if br_m["dir"] is not None else d
                src = br_m["bron"]
            else:
                src = "model"

            rain = precip[i] if i < len(precip) and precip[i] is not None else None
            point = {
                "t":    local_str[11:16],
                "date": local_str[:10],
                "v":    round(v, 1),
                "g":    round(g, 1) if g is not None else None,
                "dir":  int(round(d)) if d is not None else None,
                "src":  src,
                "rain": round(rain, 2) if rain is not None else None,
            }

            if t_utc < now_h:
                wind_past.append(point)
            elif t_utc == now_h:
                wind_live.append(point)
                live_speed = point["v"]
                live_gust  = point["g"]
                live_dir   = point["dir"]
                live_temp  = round(temps[i], 1) if i < len(temps) and temps[i] is not None else None
                live_feels = round(feels[i], 1) if i < len(feels) and feels[i] is not None else None
                live_wcode = int(wcodes[i]) if i < len(wcodes) and wcodes[i] is not None else None
            else:
                wind_forecast.append(point)

        if live_dir is None and dirs:
            for i in range(len(times) - 1, -1, -1):
                if dirs[i] is not None:
                    live_dir = int(round(dirs[i]))
                    break

        if van_open_meteo:
            leren.leg_voorspelling_vast(meta["id"], model_om_op_te_halen, voorspelling_snapshot)

    # ── Harmonie overlay voor NL-spots ───────────────────────────────────────
    # Harmonie vervangt de forecast en vult past aan als Open-Meteo ontbreekt
    if is_nl and harmonie_data:
        h_past, h_forecast = harmonie.get_spot_forecast(meta["id"], harmonie_data)
        # Harmonie geeft UTC t/date terug → omzetten naar lokale spottime
        h_forecast_local = _pts_to_local(h_forecast, utc_offset) if h_forecast else []
        h_past_local     = _pts_to_local(h_past,     utc_offset) if h_past     else []

        if h_forecast_local:
            wind_forecast = h_forecast_local  # Harmonie vervangt Open-Meteo forecast

        if not wind_past and h_past:
            # Open-Meteo was down: gebruik Harmonie verleden als fallback
            converted = []
            for p, p_local in zip(h_past, h_past_local):
                knmi = knmi_by_dt.get(
                    datetime.fromisoformat(f"{p['date']}T{p['t']}").replace(tzinfo=timezone.utc)
                )
                if knmi:
                    converted.append({**p_local, "v": knmi["v"], "g": knmi["g"], "src": "knmi"})
                else:
                    converted.append(p_local)
            wind_past = converted

        if not wind_live:
            # Haal live-punt uit Harmonie past (meest recent <= now_h)
            if h_past_local:
                wind_live = [h_past_local[-1]]
                live_speed = wind_live[0]["v"]
                live_gust  = wind_live[0].get("g")
                live_dir   = wind_live[0].get("dir")
            elif h_forecast_local:
                wind_live = [h_forecast_local[0]]
                live_speed = wind_live[0]["v"]
                live_gust  = wind_live[0].get("g")
                live_dir   = wind_live[0].get("dir")

    # ── Laatste fallback: verleden uit KNMI-station-only (als alles faalt) ───
    if not wind_past and not wind_live and knmi_by_dt:
        for dt_key in sorted(knmi_by_dt):
            row = knmi_by_dt[dt_key]
            local_dt = dt_key + timedelta(seconds=utc_offset)
            p = {"t": local_dt.strftime("%H:%M"), "date": local_dt.strftime("%Y-%m-%d"),
                 "v": row["v"], "g": row["g"], "src": "knmi"}
            if dt_key < now_h:
                wind_past.append(p)
            elif dt_key == now_h:
                wind_live = [p]
                live_speed, live_gust = p["v"], p["g"]
                live_dir = row.get("dir")

    if not wind_live and wind_past:
        wind_live = [wind_past[-1]]
        live_speed = wind_past[-1]["v"]
        live_gust  = wind_past[-1]["g"]

    # Als we helemaal geen data hebben → None zodat cache gebruikt kan worden
    if not wind_live and not wind_forecast:
        return None

    # ── Marine verwerken ─────────────────────────────────────────────────────
    marine_list = []
    wave_h = wave_p = water_temp = current_speed = current_dir = None

    marine_local = isinstance(marine_raw, dict) and "utc_offset_seconds" in marine_raw
    if marine_raw and "hourly" in marine_raw:
        mh      = marine_raw["hourly"]
        m_t     = mh.get("time", [])
        m_hs    = mh.get("wave_height", [])
        m_tp    = mh.get("wave_period", [])
        m_swh   = mh.get("swell_wave_height", [])
        m_swp   = mh.get("swell_wave_period", [])
        m_swdir = mh.get("swell_wave_direction", [])
        m_wwh   = mh.get("wind_wave_height", [])
        m_wwp   = mh.get("wind_wave_period", [])
        m_sst   = mh.get("sea_surface_temperature", [])
        m_cv    = mh.get("ocean_current_velocity", [])   # km/h
        m_cd    = mh.get("ocean_current_direction", [])  # degrees
        m_sl    = mh.get("sea_level_height_msl", [])     # m t.o.v. MSL (getij)

        for i, ts in enumerate(m_t):
            if marine_local:
                t_utc     = (datetime.fromisoformat(ts) - timedelta(seconds=utc_offset)).replace(tzinfo=timezone.utc)
                local_str = ts
            else:
                t_utc     = _parse_time(ts)
                local_dt  = t_utc + timedelta(seconds=utc_offset)
                local_str = local_dt.strftime("%Y-%m-%dT%H:%M")

            local_hour = int(local_str[11:13])
            if local_hour % 3 != 0:
                continue
            hs = m_hs[i] if i < len(m_hs) else None
            if hs is None:
                continue
            tp_i = m_tp[i] if i < len(m_tp) and m_tp[i] else None
            entry = {
                "t":    local_str[11:16],
                "date": local_str[:10],
                "hs": round(hs, 2),
                "tp": round(tp_i, 2) if tp_i is not None else None,
                "energy": round(_wave_power_kj(hs, tp_i), 1) if tp_i is not None else None,
            }
            if i < len(m_swh) and m_swh[i]:
                entry["swh"]   = round(m_swh[i], 2)
                entry["swp"]   = round(m_swp[i], 2)   if i < len(m_swp)   and m_swp[i]   else None
                entry["swdir"] = int(round(m_swdir[i])) if i < len(m_swdir) and m_swdir[i] else None
            if i < len(m_wwh) and m_wwh[i]:
                entry["wwh"] = round(m_wwh[i], 2)
                entry["wwp"] = round(m_wwp[i], 2) if i < len(m_wwp) and m_wwp[i] else None
            cv = m_cv[i] if i < len(m_cv) else None
            cd = m_cd[i] if i < len(m_cd) else None
            if cv is not None:
                entry["currentSpeed"] = round(cv * 0.539957, 2)  # km/h → kts
                entry["currentDir"]   = int(round(cd)) if cd is not None else None
            sl = m_sl[i] if i < len(m_sl) else None
            if sl is not None:
                entry["tide"] = round(sl, 2)  # m t.o.v. gemiddeld zeeniveau
            marine_list.append(entry)
            if t_utc <= now_h:
                wave_h = hs
                wave_p = m_tp[i] if i < len(m_tp) else None
                if i < len(m_sst) and m_sst[i] is not None:
                    water_temp = round(m_sst[i], 1)
                if cv is not None:
                    current_speed = round(cv * 0.539957, 2)
                    current_dir   = int(round(cd)) if cd is not None else None

    return {
        "id":        meta["id"],
        "name":      meta["name"],
        "subtitle":  meta.get("subtitle"),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "utcOffset": utc_offset,
        "location":  {"lat": meta["lat"], "lon": meta["lon"]},
        "live": {
            "windSpeed":  live_speed,
            "windGust":   live_gust,
            "windDir":    live_dir,
            "waveHeight": round(wave_h, 1) if wave_h is not None else None,
            "wavePeriod": round(wave_p, 1) if wave_p is not None else None,
            "waveEnergy": round(_wave_power_kj(wave_h, wave_p), 1) if wave_h is not None and wave_p is not None else None,
            "tide":            None,
            "currentSpeed":    current_speed,
            "currentDirection": current_dir,
            "airTemp":         live_temp,
            "feelsLike":   live_feels,
            "waterTemp":   water_temp,
            "weatherCode": live_wcode,
        },
        "windPast":     wind_past,
        "windLive":     wind_live,
        "windForecast": wind_forecast,
        "marine":       marine_list,
        "liveAt":       f"{wind_live[0]['date']}T{wind_live[0]['t']}" if wind_live else None,
        "windDaily":    _parse_daily(daily_raw),
        "webcam":       meta.get("webcam"),
        "shore_angle":  meta.get("shore_angle"),
    }


def _parse_daily(raw: dict | None) -> list:
    if not raw or "daily" not in raw:
        return []
    d = raw["daily"]
    if not d:
        return []
    result = []
    for i, date in enumerate(d.get("time", [])):
        def _g(key):
            v = d.get(key, [])
            return v[i] if i < len(v) else None
        wmax = _g("wind_speed_10m_max")
        gmax = _g("wind_gusts_10m_max")
        wdir = _g("wind_direction_10m_dominant")
        wcode = _g("weathercode")
        tmax = _g("temperature_2m_max")
        tmin = _g("temperature_2m_min")
        result.append({
            "date":        date,
            "windMax":     round(wmax, 1)       if wmax  is not None else None,
            "gustMax":     round(gmax, 1)       if gmax  is not None else None,
            "windDir":     int(round(wdir))     if wdir  is not None else None,
            "weatherCode": int(wcode)           if wcode is not None else None,
            "tempMax":     round(tmax, 1)       if tmax  is not None else None,
            "tempMin":     round(tmin, 1)       if tmin  is not None else None,
        })
    return result


def _apply_buienradar(spot: dict, meta: dict) -> dict:
    """Overlay live wind uit de snapshots (Weather2Kite, anders Buienradar).

    Leest alleen; de snapshots ververst `_live_verversen` op de achtergrond."""
    try:
        if "weather2kite_spot" in meta:
            # Geen W2K-meting, dan valt deze spot terug op Buienradar.
            local = _weather2kite_live(meta["weather2kite_spot"])
            if local:
                import copy
                spot = copy.copy(spot)
                spot["live"] = dict(spot["live"])
                spot["live"]["windSpeed"] = round(float(local["v"]), 1)
                if local["g"] is not None:
                    spot["live"]["windGust"] = round(float(local["g"]), 1)
                if local["dir"] is not None:
                    spot["live"]["windDir"] = int(round(float(local["dir"])))
                local_dt = local["dt"] + timedelta(seconds=spot.get("utcOffset", 0))
                spot["windLive"] = [{
                    "t": local_dt.strftime("%H:%M"),
                    "date": local_dt.strftime("%Y-%m-%d"),
                    "v": spot["live"]["windSpeed"],
                    "g": spot["live"].get("windGust"),
                    "dir": spot["live"].get("windDir"),
                    "src": local["src"],
                    "rain": None,
                }]
                spot["liveAt"] = local["dt"].isoformat(timespec="minutes")
                return spot

        br = _nearest_br_station(meta["lat"], meta["lon"], _buienradar_stations())
        if not br:
            return spot
        import copy
        spot = copy.copy(spot)
        spot["live"] = dict(spot["live"])
        ws = br.get("windspeed")
        wg = br.get("windgusts")
        wd = br.get("winddirectiondegrees")
        ts = br.get("timestamp")
        if ws is not None:
            spot["live"]["windSpeed"] = round(float(ws), 1)
        if wg is not None:
            spot["live"]["windGust"]  = round(float(wg), 1)
        if wd is not None:
            spot["live"]["windDir"]   = int(round(float(wd)))
        if ts:
            # Buienradar geeft naive lokale Nederlandse tijd — direct gebruiken
            spot["liveAt"] = ts[:16]
    except Exception as e:
        print(f"[WARN] Buienradar overlay {meta['id']}: {e}")
    return spot


def _get_spot(meta: dict, model: str, harmonie_data: dict | None = None) -> dict | None:
    key    = (meta["id"], model)
    cached, is_stale = _cache_get(key)
    if cached is None or is_stale:
        data = _build_spot(meta, model, harmonie_data)
        if data is None and model != "best_match":
            print(f"[INFO] {meta['id']}: model '{model}' failed, retrying with best_match")
            data = _build_spot(meta, "best_match", harmonie_data)
        if data:
            _cache_set(key, data)
            cached = data
        elif is_stale:
            print(f"[INFO] {meta['id']}: API failed, serving stale cache")
        else:
            cached = None
    if cached is None:
        return None
    return _apply_buienradar(cached, meta)


# ── Routes ─────────────────────────────────────────────────────────────────────

_GESTART = datetime.now(timezone.utc)
# Ouder dan dit betekent dat verversen al een paar rondes niet lukt (TTL 30 min,
# ronde elke 25 min). Dan is de site "op" maar toont hij verouderde verwachtingen.
_HEALTH_MAX_LEEFTIJD = timedelta(minutes=90)


def _iso(ts):
    return ts.isoformat(timespec="seconds") if ts else None


@app.route("/api/health")
def health():
    """Zegt of de site bruikbare data heeft, niet alleen dat het proces leeft.

    503 als de nieuwste best_match-data ouder is dan _HEALTH_MAX_LEEFTIJD: zo ziet
    een monitor een vastgelopen verversing, niet pas een klagende bezoeker."""
    nu = datetime.now(timezone.utc)
    with _lock:
        leeftijden = [nu - ts for (spot_id, model), (_, ts) in _cache.items()
                      if model == "best_match"]
    nieuwste = min(leeftijden) if leeftijden else None
    oudste = max(leeftijden) if leeftijden else None
    gezond = nieuwste is not None and nieuwste <= _HEALTH_MAX_LEEFTIJD
    live = {naam: {"ok": _iso(s["ok_ts"]), "fout": s["fout"], "fout_op": _iso(s["fout_ts"])}
            for naam, s in _live_status.items()}
    return jsonify({
        "ok": gezond,
        "spots": len(leeftijden),
        "spots_verwacht": len(SPOTS_META),
        "cache_nieuwste_s": int(nieuwste.total_seconds()) if nieuwste else None,
        "cache_oudste_s": int(oudste.total_seconds()) if oudste else None,
        "live": live,
        "uptime_s": int((nu - _GESTART).total_seconds()),
    }), (200 if gezond else 503)


_FEEDBACK_PATH = os.path.join(os.path.dirname(__file__), "feedback.jsonl")
_feedback_lock = threading.Lock()
_FEEDBACK_MAX_LEN = 1000
_FEEDBACK_MAX_BYTES = 2_000_000


@app.route("/api/feedback", methods=["POST"])
def post_feedback():
    """Vangt ideeën en foutmeldingen van gebruikers op in een lokaal logbestand.

    Geen mail, geen externe dienst — gewoon een regel die hier op de Pi
    blijft liggen totdat iemand 'm leest."""
    data = request.get_json(silent=True) or {}
    tekst = str(data.get("tekst", "")).strip()[:_FEEDBACK_MAX_LEN]
    if not tekst:
        return jsonify({"fout": "tekst ontbreekt"}), 400
    try:
        if os.path.getsize(_FEEDBACK_PATH) > _FEEDBACK_MAX_BYTES:
            return jsonify({"fout": "inbox vol"}), 503
    except OSError:
        pass
    regel = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tekst": tekst,
        "pagina": str(data.get("pagina", ""))[:200],
    }
    with _feedback_lock:
        with open(_FEEDBACK_PATH, "a") as f:
            f.write(json.dumps(regel, ensure_ascii=False) + "\n")
    return jsonify({"ok": True}), 201


_warming_models: set = set()
_warming_lock = threading.Lock()


def _warm_model_bg(model: str):
    """Warmt één model op op de achtergrond (alleen als niet al bezig)."""
    with _warming_lock:
        if model in _warming_models:
            return
        _warming_models.add(model)

    def _run():
        try:
            h_data = _get_harmonie_data() if KNMI_API_KEY else {}
            with ThreadPoolExecutor(max_workers=4) as ex:
                futures = {ex.submit(_get_spot, meta, model, h_data): meta["id"]
                           for meta in SPOTS_META}
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        print(f"[WARN] warm_bg {model}/{futures[future]}: {e}")
            _save_disk_cache()
            print(f"[INFO] Achtergrond warming klaar: {model}")
        finally:
            with _warming_lock:
                _warming_models.discard(model)

    threading.Thread(target=_run, daemon=True).start()


@app.route("/api/spots")
def get_spots():
    """Leest uit cache, en zet een achtergrond-refresh in gang zodra die oud is.

    Alleen best_match wordt periodiek ververst; de andere modellen worden
    on-demand opgewarmd. Die warming werd echter alleen gestart als er nog
    níéts in de cache stond. Zodra een model één keer was opgehaald, bleef het
    zichzelf serveren — hoe oud ook. In de praktijk stond KNMI daardoor op data
    van 24 april en GFS op 16 april, compleet met aprildatums in de grafiek.

    Nu telt de leeftijd: verouderde data wordt nog wel teruggegeven zodat het
    scherm niet leeg springt, maar er start meteen een refresh. Data ouder dan
    _MAX_SERVE_AGE wordt helemaal niet meer gegeven — een verwachting van
    maanden geleden is slechter dan even niets, want ze is niet als oud te
    herkennen.
    """
    model   = request.args.get("model", "best_match")
    results = []
    verouderd = False

    for meta in SPOTS_META:
        key = (meta["id"], model)
        cached, is_stale = _cache_get(key, allow_stale=True)
        if is_stale:
            verouderd = True
            if _cache_leeftijd(key) > _MAX_SERVE_AGE:
                continue
        if cached is not None:
            try:
                results.append(_apply_buienradar(cached, meta))
            except Exception:
                results.append(cached)

    # Ontbrekend óf verouderd: allebei reden om op de achtergrond te verversen.
    if (verouderd or not results) and model in _WARM_MODELS:
        reden = "verouderd" if results else "niet gecached"
        print(f"[INFO] Model '{model}' {reden}, warming gestart…")
        _warm_model_bg(model)

    resp = jsonify(results)
    # Korte edge-cache (audit F2, aanbeveling 2): bij een bezoekerspiek
    # antwoordt Cloudflare zelf, in plaats van elke keer deze worker te raken.
    resp.headers["Cache-Control"] = "public, max-age=60"
    return resp


# ---- widget (homescreen-widget op de telefoon) ──────────────────────────────
_MS_NAAR_KN = 1.94384


def _aflandigheid(wind_dir, shore_angle):
    """Zelfde indeling als getShoreType in frontend/src/hooks/useAlarmMatch.js."""
    if wind_dir is None or shore_angle is None:
        return None
    diff = abs(((wind_dir - shore_angle + 180) % 360 + 360) % 360 - 180)
    if diff <= 30:
        return "ON SHORE"
    if diff <= 60:
        return "SIDE-ON"
    if diff <= 120:
        return "SIDE SHORE"
    if diff <= 150:
        return "SIDE-OFF"
    return "OFF SHORE"


def _widget_reden(wind_ms, meta):
    """Korte reden bij een oordeel dat geen 'go' is, of None. 'iets' als het er net naast zit."""
    lo, hi = meta.get("min_wind"), meta.get("max_wind")
    if wind_ms is None or lo is None or hi is None or lo <= wind_ms <= hi:
        return None
    net_naast = lo - 2 <= wind_ms <= hi + 2
    tekst = "te weinig wind" if wind_ms < lo else "te veel wind"
    return ("iets " + tekst) if net_naast else tekst


def _widget_oordeel(wind_ms, meta):
    """go / bijna / nee, of None als de spot geen drempels heeft.

    Alleen de eenvoudige variant: windbereik uit spots.json (m/s). De regels
    die een gebruiker in de app zelf instelt staan in localStorage en zijn hier
    niet beschikbaar. 'bijna' = binnen 2 m/s van het bereik."""
    lo, hi = meta.get("min_wind"), meta.get("max_wind")
    if wind_ms is None or lo is None or hi is None:
        return None
    if lo <= wind_ms <= hi:
        return "go"
    if lo - 2 <= wind_ms <= hi + 2:
        return "bijna"
    return "nee"


@app.route("/api/widget-spots")
def get_widget_spots():
    """Lijst van spots (id, naam) voor de keuze in de Android-widget."""
    resp = jsonify(sorted(({"id": m["id"], "name": m["name"]} for m in SPOTS_META),
                          key=lambda s: s["name"].lower()))
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


def _widget_reeksen(cached, meta, dagen=7):
    """Tijdreeksen voor de grafieken in de widget, zelfde bronnen als de app.

    Tijden zijn lokale 'YYYY-MM-DDTHH:MM' (zoals date+t in /api/spots). Het
    venster loopt van 12 uur terug tot `dagen` vooruit; alles in knopen."""
    nu = cached.get("liveAt") or datetime.now().strftime("%Y-%m-%dT%H:%M")
    vanaf = (datetime.fromisoformat(nu) - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M")
    tot = (datetime.fromisoformat(nu) + timedelta(days=dagen)).strftime("%Y-%m-%dT%H:%M")

    def sleutel(p):
        return f"{p['date']}T{p['t']}"

    def binnen(ts):
        return vanaf <= ts <= tot

    def kn(v):
        return round(v * _MS_NAAR_KN, 1) if v is not None else None

    wind = {}
    for p in (cached.get("windPast") or []) + (cached.get("windLive") or []) + (cached.get("windForecast") or []):
        ts = sleutel(p)
        if binnen(ts):
            wind[ts] = {"t": ts, "kn": kn(p.get("v")), "gust": kn(p.get("g")), "dir": p.get("dir"),
                        "mm": p.get("rain")}
    wind = [wind[k] for k in sorted(wind)]

    waves, tide, stroom = [], [], []
    for p in cached.get("marine") or []:
        ts = sleutel(p)
        if not binnen(ts):
            continue
        if p.get("hs") is not None:
            waves.append({"t": ts, "hs": p["hs"], "tp": p.get("tp")})
        if p.get("tide") is not None:
            tide.append({"t": ts, "m": p["tide"]})
        if p.get("currentSpeed") is not None:
            stroom.append({"t": ts, "kn": p["currentSpeed"]})

    lo, hi = meta.get("min_wind"), meta.get("max_wind")
    return {
        "id": meta["id"], "name": meta["name"], "nowAt": nu,
        "minKn": kn(lo), "maxKn": kn(hi),
        "wind": wind, "regen": [{"t": w["t"], "mm": w["mm"] or 0} for w in wind],
        "golven": waves, "getij": tide, "stroom": stroom,
    }


@app.route("/api/widget-grafiek")
def get_widget_grafiek():
    """Tijdreeksen (wind, regen, golven, getij, stroming) voor één spot, voor
    de grafieken in de Android-widget. Leest uit dezelfde cache als /api/spots."""
    spot_id = request.args.get("spot", "")
    meta = next((m for m in SPOTS_META if m["id"] == spot_id), None)
    if meta is None:
        return jsonify({"error": "onbekende spot"}), 404
    cached, _ = _cache_get((spot_id, "best_match"), allow_stale=True)
    if cached is None:
        return jsonify({"error": "nog geen data"}), 503
    try:
        cached = _apply_buienradar(cached, meta)
    except Exception:
        pass
    resp = jsonify(_widget_reeksen(cached, meta))
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.route("/api/widget")
def get_widget():
    """Klein antwoord voor een homescreen-widget (Scriptable, KWGT): één spot,
    alleen wat een widget toont. Leest uit dezelfde cache als /api/spots en
    start zelf geen verversing."""
    spot_id = request.args.get("spot", "")
    meta = next((m for m in SPOTS_META if m["id"] == spot_id), None)
    if meta is None:
        return jsonify({"error": "onbekende spot"}), 404
    cached, _ = _cache_get((spot_id, "best_match"), allow_stale=True)
    if cached is None:
        return jsonify({"error": "nog geen data"}), 503
    try:
        cached = _apply_buienradar(cached, meta)
    except Exception:
        pass
    live = cached.get("live") or {}
    ms, gust, richting = live.get("windSpeed"), live.get("windGust"), live.get("windDir")

    def kn(v):
        return round(v * _MS_NAAR_KN) if v is not None else None

    if request.args.get("format") == "text":
        # Eén regel voor widget-apps die geen JSON ontleden (KWGT: $wg(url, txt)$).
        pijl = "" if richting is None else "↓↙←↖↑↗→↘"[round(richting / 45) % 8]
        oordeel = _widget_oordeel(ms, meta)
        regel = f"{meta['name']}: {kn(ms) if ms is not None else '–'} kn {pijl}".rstrip()
        if gust is not None:
            regel += f" (vlagen {kn(gust)})"
        if oordeel:
            regel += f" · {oordeel.upper()}"
        resp = app.response_class(regel, mimetype="text/plain")
        resp.headers["Cache-Control"] = "public, max-age=60"
        return resp

    resp = jsonify({
        "id": spot_id,
        "name": meta["name"],
        "lat": meta["lat"],
        "lon": meta["lon"],
        "windKn": kn(ms),
        "gustKn": kn(gust),
        "stroomKn": live.get("currentSpeed"),
        "stroomDir": live.get("currentDirection"),
        "dir": richting,
        "shore": _aflandigheid(richting, meta.get("shore_angle")),
        "oordeel": _widget_oordeel(ms, meta),
        "reden": _widget_reden(ms, meta),
        "updatedAt": cached.get("liveAt") or cached.get("updatedAt"),
        "url": f"https://tosurfornottosurf.nl/mobile/?spot={spot_id}",
    })
    resp.headers["Cache-Control"] = "public, max-age=60"
    return resp


# ---- drukkaart (kaart-achtergrond bij de grafiek) ───────────────────────────
# Overgenomen uit de watersport-trainer-app (05-10-2026), maar niet 1-op-1:
# daar is dit een blokkerende call ín het verzoek. Na de F1-audit hier (29-09)
# mag een trage externe bron /api/spots nooit meer laten hangen; dezelfde regel
# geldt voor deze route. Daarom alleen uit cache lezen en op de achtergrond
# verversen, met hetzelfde korte timeout als Buienradar/Weather2Kite.
_druk_cache: dict = {}   # (lat, lon) -> (data, ts)
_druk_bezig: set = set()


def _druk_rondaf(x):
    """Op een halve graad: spots dichtbij delen hetzelfde rasterpunt."""
    return round(x * 2) / 2


def _druk_ophalen(lat, lon):
    straal_km = 450
    dlat = straal_km / 111.32
    dlon = dlat / math.cos(math.radians(lat)) if abs(lat) < 89 else dlat
    lats = [round(lat - dlat + 2 * dlat * i / 8, 3) for i in range(9)]
    lons = [round(lon - dlon + 2 * dlon * j / 8, 3) for j in range(9)]
    punten = [(a, b) for a in lats for b in lons]
    try:
        r = req.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": ",".join(str(a) for a, _ in punten),
                "longitude": ",".join(str(b) for _, b in punten),
                "hourly": "pressure_msl",
                "forecast_days": 2,
                "timezone": "GMT",
            },
            timeout=_LIVE_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            data = [data]
        nu = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
        tijden = data[0]["hourly"]["time"]
        i = tijden.index(nu) if nu in tijden else 0
        waarden = [d["hourly"]["pressure_msl"][i] for d in data]
        if len(waarden) != len(punten) or any(v is None for v in waarden):
            return
        hpa = [waarden[ri * len(lons):(ri + 1) * len(lons)] for ri in range(len(lats))]
        _druk_cache[(lat, lon)] = ({"lats": lats, "lons": lons, "hpa": hpa}, datetime.now(timezone.utc))
    except Exception:
        pass  # stil falen: de kaart blijft dan zonder isobaren, net als bij een hangende Buienradar.


def _druk_bg(lat, lon):
    sleutel = (lat, lon)
    if sleutel in _druk_bezig:
        return
    _druk_bezig.add(sleutel)

    def _run():
        try:
            _druk_ophalen(lat, lon)
        finally:
            _druk_bezig.discard(sleutel)

    threading.Thread(target=_run, daemon=True).start()


@app.route("/api/drukkaart")
def drukkaart():
    """Luchtdruk op zeeniveau rond een spot, voor de kaart-achtergrond bij de
    grafiek. Leest alleen de cache; ververst op de achtergrond zodra die
    ontbreekt of ouder dan een uur is. Nooit blokkerend."""
    try:
        lat, lon = _druk_rondaf(float(request.args["lat"])), _druk_rondaf(float(request.args["lon"]))
    except (KeyError, ValueError):
        return jsonify({"error": "lat en lon zijn verplicht en moeten getallen zijn"}), 400
    sleutel = (lat, lon)
    cached = _druk_cache.get(sleutel)
    if not cached or datetime.now(timezone.utc) - cached[1] > timedelta(hours=1):
        _druk_bg(lat, lon)
    return jsonify(cached[0] if cached else None)


# Alle modellen die de frontend aanbiedt — moet synchroon lopen met SpotSidebar.jsx
_WARM_MODELS = [
    "best_match",
    "ecmwf_ifs025",
    "gfs_seamless",
    "icon_seamless",
    "knmi_harmonie_arome_europe",
    "meteofrance_seamless",
]


# ── Cache vooraf opwarmen bij opstarten ───────────────────────────────────────
def _warm_cache():
    """
    Warmt de cache op voor alle modellen.
    best_match wordt als eerste gedaan zodat de standaard view direct werkt.
    De overige modellen volgen sequentieel op de achtergrond.
    """
    import time
    time.sleep(5)  # wacht even tot gunicorn klaar is met opstarten
    print("[INFO] Cache warming gestart…")
    try:
        h_data = _get_harmonie_data() if KNMI_API_KEY else {}

        # best_match eerst en alleen, zodat de standaard view meteen werkt.
        for model in _WARM_MODELS[:1]:
            with ThreadPoolExecutor(max_workers=4) as ex:
                futures = {ex.submit(_get_spot, meta, model, h_data): meta["id"]
                           for meta in SPOTS_META}
                done = 0
                for future in as_completed(futures):
                    done += 1
                    try:
                        future.result()
                    except Exception as e:
                        print(f"[WARN] warm {model}/{futures[future]}: {e}")
            print(f"[INFO] Cache warming {model}: {done}/{len(SPOTS_META)} spots klaar")
            _save_disk_cache()

        # De overige modellen ná best_match, één voor één met een pauze ertussen:
        # dit stond er al als docstring-belofte maar deed niets (de lus liep alleen
        # over _WARM_MODELS[:1]). Zonder dit is elk model na een herstart ~45-60s
        # leeg zodra iemand hem voor het eerst kiest. Sequentieel + pauze i.p.v.
        # gelijktijdig: een eerdere burst van alle modellen tegelijk destabiliseerde
        # de WiFi (zie project_pi_netwerk).
        for model in _WARM_MODELS[1:]:
            time.sleep(15)
            with ThreadPoolExecutor(max_workers=4) as ex:
                futures = {ex.submit(_get_spot, meta, model, h_data): meta["id"]
                           for meta in SPOTS_META}
                done = 0
                for future in as_completed(futures):
                    done += 1
                    try:
                        future.result()
                    except Exception as e:
                        print(f"[WARN] warm {model}/{futures[future]}: {e}")
            print(f"[INFO] Cache warming {model}: {done}/{len(SPOTS_META)} spots klaar")
            _save_disk_cache()

        print(f"[INFO] Cache warming volledig klaar ({len(_WARM_MODELS)} modellen × {len(SPOTS_META)} spots)")
    except Exception as e:
        print(f"[WARN] Cache warming mislukt: {e}")

threading.Thread(target=_warm_cache, daemon=True).start()


# ── Periodieke achtergrondrefresh (elke 25 minuten) ───────────────────────────
_REFRESH_INTERVAL = 25 * 60  # seconden


def _periodic_refresh():
    """Herlaad best_match cache voor alle spots en plant de volgende refresh."""
    print("[INFO] Periodieke cache refresh gestart…")
    try:
        h_data = _get_harmonie_data() if KNMI_API_KEY else {}
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(_get_spot, meta, "best_match", h_data): meta["id"]
                       for meta in SPOTS_META}
            done = 0
            for future in as_completed(futures):
                done += 1
                try:
                    future.result()
                except Exception as e:
                    print(f"[WARN] refresh/{futures[future]}: {e}")
        _save_disk_cache()
        print(f"[INFO] Periodieke refresh klaar: {done}/{len(SPOTS_META)} spots")
    except Exception as e:
        print(f"[WARN] Periodieke refresh mislukt: {e}")
    finally:
        _schedule_refresh()


def _schedule_refresh():
    t = threading.Timer(_REFRESH_INTERVAL, _periodic_refresh)
    t.daemon = True
    t.start()


_schedule_refresh()
threading.Thread(target=_live_verversen, daemon=True).start()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
