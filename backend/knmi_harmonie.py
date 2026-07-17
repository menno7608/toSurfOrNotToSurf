# knmi_harmonie.py
#
# Haalt KNMI Harmonie-Arome Cy43 P1 windverwachting op via het KNMI Data Platform.
# Werkt voor Nederlandse spots (±50.5–53.7°N, 3.0–7.5°E).
#
# Vereisten:
#   sudo apt install libeccodes-dev libeccodes-data
#   pip install cfgrib xarray scipy
#
# KNMI_API_KEY: gratis via https://developer.dataplatform.knmi.nl/
# Demo/anonieme key werkt ook maar is rate-limited.

import json
import math
import os
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests

_DATASET   = "harmonie-arome-cy43-p1"
_VERSION   = "1.0"
_BASE_URL  = f"https://api.dataplatform.knmi.nl/open-data/v1/datasets/{_DATASET}/versions/{_VERSION}"

# Bounding box Nederland + directe omgeving (dekt ook Borkum, Vlissingen etc.)
NL_LAT_MIN, NL_LAT_MAX = 50.5, 53.8
NL_LON_MIN, NL_LON_MAX = 2.5,  7.6

# Cache-pad naast dit bestand
_CACHE_DIR  = Path(__file__).parent / "harmonie_cache"
_CACHE_FILE = _CACHE_DIR / "forecast.json"
_CACHE_TTL  = timedelta(hours=1)

_lock = threading.Lock()


def is_nl_spot(lat: float, lon: float) -> bool:
    return NL_LAT_MIN <= lat <= NL_LAT_MAX and NL_LON_MIN <= lon <= NL_LON_MAX


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _load_cache() -> dict | None:
    """Laad gecachede Harmonie-data. Geeft None als cache leeg of verlopen is."""
    try:
        if not _CACHE_FILE.exists():
            return None
        raw = json.loads(_CACHE_FILE.read_text())
        ts = datetime.fromisoformat(raw["fetched_at"]).replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - ts > _CACHE_TTL:
            return None
        return raw["spots"]
    except Exception:
        return None


def _load_stale_cache() -> dict | None:
    """Geeft altijd de cache terug, ook als die verlopen is (voor fallback)."""
    try:
        if not _CACHE_FILE.exists():
            return None
        raw = json.loads(_CACHE_FILE.read_text())
        return raw.get("spots")
    except Exception:
        return None


def _save_cache(spots_data: dict):
    _CACHE_DIR.mkdir(exist_ok=True)
    _CACHE_FILE.write_text(json.dumps({
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "spots": spots_data,
    }))


# ── KNMI Data Platform API ─────────────────────────────────────────────────────

def _get_latest_filename(api_key: str) -> str | None:
    """Haalt de naam van het meest recente Harmonie P1 bestand op."""
    headers = {"Authorization": api_key}
    r = requests.get(
        f"{_BASE_URL}/files",
        headers=headers,
        params={"maxKeys": 5, "orderBy": "lastModified", "sorting": "desc"},
        timeout=15,
    )
    r.raise_for_status()
    files = r.json().get("files", [])
    if not files:
        return None
    return files[0]["filename"]


def _get_download_url(filename: str, api_key: str) -> str:
    """Vraagt een tijdelijke download-URL op voor een specifiek GRIB-bestand."""
    headers = {"Authorization": api_key}
    r = requests.get(
        f"{_BASE_URL}/files/{filename}/url",
        headers=headers,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["temporaryDownloadUrl"]


def _download_grib(url: str, dest: str):
    """Download een GRIB-bestand naar dest."""
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):  # 1 MB chunks
                f.write(chunk)


# ── GRIB parsing ───────────────────────────────────────────────────────────────

def _extract_points(grib_path: str, spots: list[dict]) -> dict:
    """
    Leest het GRIB-bestand en extraheert per spot de windverwachting.
    Geeft dict: spot_id → list van {t, date, v, g, dir, src}.
    """
    import cfgrib
    import xarray as xr

    result = {s["id"]: [] for s in spots}

    try:
        # Open alle berichten in het GRIB-bestand
        # cfgrib kan meerdere datasets teruggeven voor heterogene bestanden
        ds_list = cfgrib.open_datasets(grib_path)
    except Exception as e:
        print(f"[WARN] Harmonie: GRIB openen mislukt: {e}")
        return result

    # Zoek datasets met 10m-windcomponenten en gusts
    ds_u = ds_v = ds_g = None
    for ds in ds_list:
        vars_ = set(ds.data_vars)
        if "u10" in vars_ and "v10" in vars_:
            ds_u, ds_v = ds, ds
        if "i10fg" in vars_ or "fg" in vars_ or "gust" in vars_:
            ds_g = ds

    if ds_u is None:
        # Probeer alternatieve variabelenamen
        for ds in ds_list:
            coords = set(ds.coords) | set(ds.data_vars)
            u_var = next((v for v in ("u10", "10u", "u") if v in coords), None)
            v_var = next((v for v in ("v10", "10v", "v") if v in coords), None)
            if u_var and v_var:
                ds_u = ds.rename({u_var: "u10", v_var: "v10"})
                ds_v = ds_u
                break

    if ds_u is None:
        print("[WARN] Harmonie: geen winddata gevonden in GRIB")
        return result

    # Tijdas bepalen
    try:
        times = ds_u.coords.get("valid_time") or ds_u.coords.get("time")
        if times is None:
            return result
        times_np = times.values  # numpy datetime64 array
    except Exception as e:
        print(f"[WARN] Harmonie: tijdas lezen mislukt: {e}")
        return result

    lats = ds_u.latitude.values
    lons = ds_u.longitude.values

    for spot in spots:
        slat, slon = spot["lat"], spot["lon"]

        # Vind het dichtstbijzijnde gridpunt
        if lats.ndim == 1 and lons.ndim == 1:
            # Regulier grid
            i = int(np.argmin(np.abs(lats - slat)))
            j = int(np.argmin(np.abs(lons - slon)))
            u_ts = ds_u["u10"].values[..., i, j] if ds_u["u10"].ndim == 3 else ds_u["u10"].values
            v_ts = ds_v["v10"].values[..., i, j] if ds_v["v10"].ndim == 3 else ds_v["v10"].values
        else:
            # Niet-regulier grid — zoek dichtstbijzijnde punt
            dist = np.sqrt((lats - slat) ** 2 + (lons - slon) ** 2)
            flat_idx = int(np.argmin(dist))
            if ds_u["u10"].ndim == 2:
                u_ts = ds_u["u10"].values[:, flat_idx]
                v_ts = ds_v["v10"].values[:, flat_idx]
            else:
                u_ts = np.array([ds_u["u10"].values.flat[flat_idx]])
                v_ts = np.array([ds_v["v10"].values.flat[flat_idx]])

        # Gust ophalen als beschikbaar
        g_var = next((v for v in ("i10fg", "fg", "gust", "10fg") if ds_g and v in ds_g.data_vars), None)
        if ds_g and g_var:
            g_lats = ds_g.latitude.values
            g_lons = ds_g.longitude.values
            if g_lats.ndim == 1 and g_lons.ndim == 1:
                gi = int(np.argmin(np.abs(g_lats - slat)))
                gj = int(np.argmin(np.abs(g_lons - slon)))
                g_ts = ds_g[g_var].values[..., gi, gj]
            else:
                dist_g = np.sqrt((g_lats - slat) ** 2 + (g_lons - slon) ** 2)
                gfi = int(np.argmin(dist_g))
                g_ts = ds_g[g_var].values[:, gfi] if ds_g[g_var].ndim == 2 else np.array([ds_g[g_var].values.flat[gfi]])
        else:
            g_ts = [None] * len(u_ts)

        now_h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        points = []
        for k, t_np in enumerate(times_np):
            t = datetime.utcfromtimestamp(t_np.astype("datetime64[s]").astype("int64")).replace(tzinfo=timezone.utc)
            u = float(u_ts[k]) if k < len(u_ts) and not np.isnan(u_ts[k]) else None
            v = float(v_ts[k]) if k < len(v_ts) and not np.isnan(v_ts[k]) else None
            if u is None or v is None:
                continue
            speed = math.sqrt(u ** 2 + v ** 2)
            direction = (270 - math.degrees(math.atan2(v, u))) % 360
            g = float(g_ts[k]) if k < len(g_ts) and g_ts[k] is not None and not np.isnan(g_ts[k]) else None
            points.append({
                "t":    t.strftime("%H:%M"),
                "date": t.strftime("%Y-%m-%d"),
                "v":    round(speed, 1),
                "g":    round(g, 1) if g is not None else None,
                "dir":  int(round(direction)),
                "src":  "harmonie",
                "_ts":  t.isoformat(),  # voor splitsen past/forecast
            })

        result[spot["id"]] = points

    return result


# ── Publieke API ────────────────────────────────────────────────────────────────

def fetch_all_nl_spots(spots: list[dict], api_key: str) -> dict:
    """
    Haalt Harmonie-windverwachting op voor alle NL-spots tegelijk.
    Geeft dict: spot_id → list van punten met velden t, date, v, g, dir, src.
    Resultaat is gecached (TTL 1 uur).
    """
    nl_spots = [s for s in spots if is_nl_spot(s["lat"], s["lon"])]
    if not nl_spots:
        return {}

    with _lock:
        cached = _load_cache()
        if cached is not None:
            return cached

        print("[INFO] Harmonie: downloaden nieuw GRIB-bestand…")
        grib_tmp = None
        try:
            filename = _get_latest_filename(api_key)
            if not filename:
                raise RuntimeError("Geen bestanden gevonden op KNMI Data Platform")

            dl_url = _get_download_url(filename, api_key)

            # Download naar tijdelijk bestand
            fd, grib_tmp = tempfile.mkstemp(suffix=".grb2", prefix="harmonie_")
            os.close(fd)
            _download_grib(dl_url, grib_tmp)
            print(f"[INFO] Harmonie: {filename} gedownload ({os.path.getsize(grib_tmp) // 1024} KB)")

            # Extraheer punten
            data = _extract_points(grib_tmp, nl_spots)
            _save_cache(data)
            print(f"[INFO] Harmonie: data voor {len(nl_spots)} NL-spots opgeslagen")
            return data

        except Exception as e:
            print(f"[WARN] Harmonie fetch mislukt: {e}")
            stale = _load_stale_cache()
            if stale:
                print("[INFO] Harmonie: stale cache wordt gebruikt")
            return stale or {}

        finally:
            if grib_tmp and os.path.exists(grib_tmp):
                os.unlink(grib_tmp)


def get_spot_forecast(spot_id: str, harmonie_data: dict) -> tuple[list, list]:
    """
    Splits Harmonie-data voor één spot in (past_points, forecast_points)
    t.o.v. het huidige uur.
    """
    points = harmonie_data.get(spot_id, [])
    now_h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    past, forecast = [], []
    for p in points:
        t = datetime.fromisoformat(p["_ts"]).replace(tzinfo=timezone.utc)
        clean = {k: v for k, v in p.items() if k != "_ts"}
        if t <= now_h:
            past.append(clean)
        else:
            forecast.append(clean)

    return past, forecast
