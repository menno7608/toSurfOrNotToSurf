# ~/Documents/raspberry-weather-screen/backend/app.py

from flask import Flask, jsonify, render_template, request, send_from_directory, redirect
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading, os, math
import requests as req
import knmi_harmonie as harmonie

app = Flask(__name__, static_folder="static", template_folder="templates")

# Gebouwde React-app serveren (na `npm run build`)
REACT_BUILD     = os.path.join(os.path.dirname(__file__), "static", "app")
REACT_DEV_BUILD = os.path.join(os.path.dirname(__file__), "static", "app-dev")


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
_DISK_CACHE   = os.path.join(os.path.dirname(__file__), "cache.json")


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
        with open(_DISK_CACHE, "w") as f:
            _json.dump(raw, f)
    except Exception as e:
        print(f"[WARN] Disk cache opslaan mislukt: {e}")


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


def _cache_set(key, data):
    with _lock:
        _cache[key] = (data, datetime.now(timezone.utc))


_load_disk_cache()


# ── Buienradar live (10-min) ──────────────────────────────────────────────────
_br_cache: dict = {"data": None, "ts": None}
_br_lock = threading.Lock()

def _fetch_buienradar() -> list:
    with _br_lock:
        if _br_cache["data"] and _br_cache["ts"]:
            if datetime.now(timezone.utc) - _br_cache["ts"] < timedelta(minutes=10):
                return _br_cache["data"]
        # HTTP call binnen de lock zodat slechts één thread tegelijk fetcht
        r = req.get("https://data.buienradar.nl/2.0/feed/json", timeout=10)
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
def _fetch_weather(lat, lon, model):
    with _om_semaphore:
        r = req.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": lat, "longitude": lon,
            "hourly":   "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,apparent_temperature,weathercode,precipitation",
            "daily":    "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weathercode,temperature_2m_max,temperature_2m_min",
            "past_hours": 12,
            "forecast_days": 7,
            "wind_speed_unit": "ms",
            "timezone": "auto",
            "models":   model,
        }, timeout=15)
        r.raise_for_status()
        return r.json()


# ── MET Norway fallback (gratis, geen key, wereldwijd) ────────────────────────
_MET_UA = "raspberry-weather-screen/1.0 contact@example.com"

def _fetch_met_norway(lat, lon):
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
            "past_hours": 12, "forecast_hours": 240,
            "timezone": "auto",
        }, timeout=15)
        r.raise_for_status()
        return r.json()


# ── KNMI uurgegevens (gemeten, station 330 = Hoek van Holland) ─────────────────
def _fetch_knmi(station_nr: int, hours: int = 14) -> list:
    """
    Haalt gemeten uurlijkse winddata op van een KNMI-station.
    Station 330 = Hoek van Holland (dichtstbij Scheveningen aan de kust).
    Variabelen: FH = uurgemiddelde wind (0.1 m/s), FX = windstoot (0.1 m/s), DD = richting.
    """
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(hours=hours)).strftime("%Y%m%d%H")
    end   = now.strftime("%Y%m%d%H")

    r = req.get(
        "https://www.daggegevens.knmi.nl/klimatologie/uurgegevens",
        params={"stns": station_nr, "vars": "FH:FX:DD", "start": start, "end": end, "fmt": "json"},
        timeout=12,
    )
    r.raise_for_status()
    rows = r.json()

    result = []
    for row in rows:
        yyyymmdd = str(row["YYYYMMDD"])
        hh = int(row["HH"])   # 1-24 (KNMI convention: HH=1 = uur 00:00-01:00)
        dt = datetime(
            int(yyyymmdd[:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:]),
            (hh - 1) % 24, 0, tzinfo=timezone.utc
        )
        if hh == 24:
            dt += timedelta(days=1)

        fh = row.get("FH")
        fx = row.get("FX")
        dd = row.get("DD")
        if fh is None:
            continue

        result.append({
            "dt":  dt,
            "t":   dt.strftime("%H:%M"),
            "v":   round(fh / 10, 1),
            "g":   round(fx / 10, 1) if fx is not None else None,
            "dir": int(dd) if dd is not None else None,
            "src": "knmi",
        })

    return result


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

    # ── Weerdata ophalen: Open-Meteo → MET Norway fallback ───────────────────
    weather = None
    try:
        weather = _fetch_weather(meta["lat"], meta["lon"], model)
    except Exception as e:
        print(f"[WARN] Open-Meteo {meta['id']}: {e}")

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
            for row in _fetch_knmi(meta["knmi_stn"]):
                knmi_by_dt[row["dt"]] = row
        except Exception as e:
            print(f"[WARN] KNMI {meta['id']}: {e}")

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

            # Vervang door KNMI-meting als beschikbaar (alleen verleden)
            knmi = knmi_by_dt.get(t_utc)
            if knmi and t_utc < now_h:
                v   = knmi["v"]
                g   = knmi["g"]
                d   = knmi["dir"] if knmi["dir"] else d
                src = "knmi"
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
            entry = {
                "t":    local_str[11:16],
                "date": local_str[:10],
                "hs": round(hs, 2),
                "tp": round(m_tp[i], 2) if i < len(m_tp) and m_tp[i] else None,
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
    """Overlay live wind met verse Buienradar-meting (eigen 10-min cache)."""
    try:
        br_stations = _fetch_buienradar()
        br = _nearest_br_station(meta["lat"], meta["lon"], br_stations)
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

@app.route("/api/health")
def health():
    return jsonify({"ok": True})


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
    """Leest uit cache. Triggert achtergrond-warming als een model nog niet gecached is."""
    model   = request.args.get("model", "best_match")
    results = []

    for meta in SPOTS_META:
        key = (meta["id"], model)
        cached, _ = _cache_get(key, allow_stale=True)
        if cached is not None:
            try:
                results.append(_apply_buienradar(cached, meta))
            except Exception:
                results.append(cached)

    # Als dit model helemaal niet in cache zit, warm het op de achtergrond op
    if not results and model in _WARM_MODELS:
        print(f"[INFO] Cache miss voor model '{model}', warming gestart…")
        _warm_model_bg(model)

    return jsonify(results)


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

        # Warm alleen best_match bij opstarten; andere modellen worden on-demand geladen.
        # Dit voorkomt een burst van ~600 HTTP-requests die de WiFi destabiliseert.
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
