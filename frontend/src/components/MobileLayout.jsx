import { useState, useEffect, useMemo } from "react";
import WindChart from "./WindChart.jsx";
import MiniChart from "./MiniChart.jsx";
import WeekForecast from "./WeekForecast.jsx";
import WebcamOverlay from "./WebcamOverlay.jsx";
import CurrentMapOverlay from "./CurrentMapOverlay.jsx";
import CurrentChart from "./CurrentChart.jsx";
import WaveChart from "./WaveChart.jsx";
import TideChart from "./TideChart.jsx";
import RainChart from "./RainChart.jsx";
import ChartTabs from "./ChartTabs.jsx";
import KaartAchtergrond from "./KaartAchtergrond.jsx";
import Instellingen from "./Instellingen.jsx";
import { currentStrength, CURRENT_BANDS } from "./SpotSidebar.jsx";
import { convertWind } from "./SpotInfo.jsx";
import { fmtUpdatedAt } from "../time.js";
import WEBCAMS from "../webcams.js";
import { useTheme } from "../theme.js";
import { useVenster } from "../tijdvenster.js";
import { t as vertaal, locale, huidigeTaal, zetTaal } from "../taal.js";

const WMO_ICON = {
  0: "sunny",   1: "sunny",   2: "partly-cloudy", 3: "overcast",
  45: "fog",    48: "fog",
  51: "showers", 53: "rain",  55: "rain",
  61: "rain",   63: "rain",   65: "heavy-rain",
  66: "sleet",  67: "sleet",
  71: "snow",   73: "snow",   75: "snow",   77: "snow",
  80: "showers", 81: "showers", 82: "storm",
  85: "snow",   86: "snow",
  95: "thunderstorm", 96: "hail", 99: "hail",
};

function WeatherIcon({ code, windSpeed, size = 40 }) {
  let name = code != null ? WMO_ICON[code] : null;
  if (!name) return null;
  if ((code === 0 || code === 1) && windSpeed != null && windSpeed > 12) name = "windy";
  return (
    <img
      src={`${import.meta.env.BASE_URL}weather-icons/${name}.png`}
      alt={name}
      style={{ height: size, width: "auto", objectFit: "contain", display: "block", flexShrink: 0 }}
    />
  );
}

/* Korte modelnamen op de telefoon.

   Op iOS moet dit veld minstens 16px zijn, anders zoomt Safari bij het aantikken
   de hele pagina in en zoomt niet terug. Bij die lettergrootte paste
   "Best Match (auto)" niet meer naast de eenheidsknoppen: de knop las nog maar
   "Best M▾", en een afkapping die je niet kunt lezen is erger dan een korte
   naam die je wél kunt lezen.

   Een native `select` toont de tekst van de gekozen optie, dus dicht en open
   kunnen niet verschillen — de korte naam is de naam. Op een scherm van 390px
   voegt "Harmonie (KNMI)" ook weinig toe boven "KNMI". Het wandscherm gebruikt
   deze lijst niet; dat heeft zijn eigen keuzemenu met de volledige namen. */
const MODELS = [
  { id: "best_match",                 label: "Auto" },
  { id: "ecmwf_ifs025",               label: "ECMWF" },
  { id: "gfs_seamless",               label: "GFS" },
  { id: "icon_seamless",              label: "ICON" },
  { id: "knmi_harmonie_arome_europe", label: "KNMI" },
  { id: "meteofrance_seamless",       label: "Météo-FR" },
];

const UNITS = ["kts", "m/s", "km/h"];

function compassDir(d) {
  if (d == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}

function fmt(v, u) {
  return v == null ? "—" : `${Number(v).toFixed(1)} ${u}`;
}

function fmtWind(ms, unit) {
  return ms == null ? "—" : `${convertWind(ms, unit).toFixed(1)}`;
}

function compass(deg) {
  if (deg == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function cleanScore(hs, swh) {
  if (hs == null || hs === 0 || swh == null) return null;
  const pct = Math.round((swh / hs) * 100);
  if (pct >= 75) return { pct, color: "#27ae60" };
  if (pct >= 50) return { pct, color: "#2980b9" };
  if (pct >= 25) return { pct, color: "#e07b3a" };
  return { pct, color: "#c0392b" };
}

function swellShoreType(swdir, shoreAngle) {
  if (swdir == null || shoreAngle == null) return null;
  const diff = Math.abs(((swdir - shoreAngle + 180) % 360 + 360) % 360 - 180);
  if (diff <= 45)  return { label: "ONSHORE",  color: "#27ae60" };
  if (diff <= 90)  return { label: "ANGLED",   color: "#2980b9" };
  if (diff <= 135) return { label: "SIDE",     color: "#e07b3a" };
  return               { label: "OFFSHORE", color: "#c0392b" };
}

function waveQuality(period) {
  if (period == null) return null;
  if (period >= 14) return { label: "GROUNDSWELL", color: "#27ae60" };
  if (period >= 10) return { label: "SWELL",       color: "#2980b9" };
  if (period >= 6)  return { label: "WINDSWELL",   color: "#e07b3a" };
  return                   { label: "CHOP",         color: "#c0392b" };
}

function filterMarine(marine, nowMs) {
  if (!marine?.length || nowMs == null) return [];
  const lo = nowMs - 36 * 60 * 60 * 1000;  // zelfde terugblik als de windgrafiek (gekoppeld tijdvenster)
  const hi = nowMs + 24 * 60 * 60 * 1000;
  return marine
    .filter((p) => {
      const ms = new Date(`${p.date}T${p.t}:00Z`).getTime();
      return ms >= lo && ms <= hi;
    })
    .map((p) => ({ ...p, _key: `${p.date}T${p.t}` }));
}

function nowKey(marine, nowMs) {
  if (!marine?.length || nowMs == null) return null;
  return marine.reduce((best, p) => {
    const diff = Math.abs(new Date(`${p.date}T${p.t}:00Z`).getTime() - nowMs);
    return diff < best.diff ? { key: p._key, diff } : best;
  }, { key: null, diff: Infinity }).key;
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

function WindArrow({ deg = 0, size = 22 }) {
  const C = useTheme();
  const angle = deg + 90;
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ color: C.border, flexShrink: 0 }}>
      <g transform={`rotate(${angle})`}>
        <line x1={-9} y1={0} x2={7} y2={0} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        <path d="M3,-4 L9,0 L3,4" stroke="currentColor" strokeWidth={2} fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function BreakingWaveIcon({ active }) {
  const sw = active ? 2.2 : 1.2;
  const op = active ? 1   : 0.38;
  return (
    <svg width="14" height="8" viewBox="0 0 28 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="4.8" stroke="#7a9db0" strokeWidth={sw * 0.8} opacity={op} />
      <path d="M11 15 C15 15 18 2 22 4 C25 5 25 11 22 12 C21 12 20 12 19 12"
        stroke="#7a9db0" strokeWidth={sw}
        strokeLinecap="round" strokeLinejoin="round" opacity={op} />
      <path d="M22 5 C24 7 24 10 22 12"
        stroke="#7a9db0" strokeWidth={sw * 0.85}
        strokeLinecap="round" opacity={op} />
    </svg>
  );
}

function HuisIcoon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinejoin="round" aria-label="Thuisspot" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }}>
      <path d="M4 10.8 12 4l8 6.8V20h-5.2v-5.6H9.2V20H4Z" />
    </svg>
  );
}

function MobileSpotPicker({ spots, selectedId, onSelectId, favorites, onToggleFavorite, homeSpotId = "" }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = spots.find((s) => s.id === selectedId) ?? spots[0];
  const filtered = search
    ? spots.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spots;

  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <button onClick={() => { setOpen((v) => !v); setSearch(""); }} style={{
        fontSize: "clamp(18px, 5.5vw, 24px)", fontWeight: 700, color: C.dark,
        background: "transparent", border: "none", outline: "none", cursor: "pointer",
        padding: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
      }}>
        {selected?.id && selected.id === homeSpotId && <HuisIcoon size={18} />}{selected?.name ?? "—"} ▾
      </button>
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.3)",
        }} onClick={() => setOpen(false)}>
          <div style={{
            position: "absolute", top: 60, left: 12, right: 12,
            background: C.cream, border: `2px solid ${C.border}`, borderRadius: 8,
          }} onClick={(e) => e.stopPropagation()}>
            {/* Zoekbalk */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}44` }}>
              <input
                autoFocus
                type="text"
                placeholder="Search spot..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  fontSize: 16, padding: "6px 10px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: C.cream,
                  color: C.dark, outline: "none",
                }}
              />
            </div>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {filtered.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.border}22` }}>
                  <div onClick={() => { onSelectId(s.id); setOpen(false); }} style={{
                    flex: 1, padding: "12px 16px",
                    fontSize: 16, fontWeight: s.id === selectedId ? 700 : 400,
                    color: s.id === selectedId ? C.border : C.dark, cursor: "pointer",
                  }}>
                    {s.id === homeSpotId && <HuisIcoon />}{s.name ?? s.id}
                  </div>
                  <div onClick={() => onToggleFavorite(s.id)} style={{ padding: "12px 14px 12px 4px", cursor: "pointer" }}>
                    <BreakingWaveIcon active={favorites.includes(s.id)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const M_TO_FT = 3.28084;
function fmtWave(m, waveUnit) {
  if (m == null) return "—";
  if (waveUnit === "ft") return `${(m * M_TO_FT).toFixed(1)}ft`;
  return `${Number(m).toFixed(1)}m`;
}

export default function MobileLayout({
  spots, spot, selectedId, onSelectId,
  unit, onUnitChange,
  weatherModel, onModelChange,
  loading,
  favorites = [], onToggleFavorite,
  spotModels = {}, onSaveSpotModel,
  isDark = false, onThemeToggle,
  waveUnit = "m", onWaveUnitToggle,
  alarmMatch = false, onAlarmToggle,
  homeSpotId = "", onHomeSpot,
}) {
  const C = useTheme();
  const l = spot?.live ?? {};

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMs = useMemo(
    () => Date.now() + (spot?.utcOffset ?? 0) * 1000,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, spot?.utcOffset]
  );
  const marine     = useMemo(() => filterMarine(spot?.marine, nowMs), [spot?.marine, nowMs]);
  const marineNowT = useMemo(() => nowKey(marine, nowMs), [marine, nowMs]);

  // "Nu" = het marinepunt dichtst bij de klok; marine[0] ligt sinds de 36 uur terugblik in het verleden.
  const cm    = marine.find((p) => p._key === marineNowT) ?? marine[0] ?? null;
  const swp   = cm?.swp   ?? null;
  const tp    = cm?.tp    ?? l.wavePeriod ?? null;
  const swh   = cm?.swh   ?? null;
  const swdir = cm?.swdir ?? null;
  const wwh   = cm?.wwh   ?? null;
  const wwp   = cm?.wwp   ?? null;
  const hs    = cm?.hs    ?? l.waveHeight ?? null;

  const quality    = waveQuality(swp ?? tp);
  const clean      = cleanScore(hs, swh);
  const swellShore = swellShoreType(swdir, spot?.shore_angle);
  // Datums onder de grafieken volgen het gedeelde tijdvenster, niet de hele reeks.
  const venster    = useVenster();
  const startDate  = venster ? new Date(venster.start).toISOString().slice(0, 10) : marine[0]?.date;
  const endDate    = venster ? new Date(venster.eind).toISOString().slice(0, 10) : marine[marine.length - 1]?.date;

  // Live klok
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");

  // Webcam overlay
  const hasWebcam = !!(WEBCAMS[spot?.id] ?? spot?.webcam);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [rwsMapOpen, setRwsMapOpen] = useState(false);
  const [activeChart, setActiveChart] = useState("wind");
  // Sluit overlays en reset grafiek als je van spot wisselt
  useEffect(() => { setWebcamOpen(false); setRwsMapOpen(false); setActiveChart("wind"); }, [spot?.id]);

  const [scrollTargetDate, setScrollTargetDate] = useState(null);
  useEffect(() => { setScrollTargetDate(null); }, [spot?.id]);

  // Actieve grafiek-punten
  const [activeWave, setActiveWave]   = useState(null);
  const [activeSwell, setActiveSwell] = useState(null);
  const [activeCurrent, setActiveCurrent] = useState(null);
  // Aangewezen punt in de windgrafiek: de pijlen op de kaart volgen het.
  const [kaartMoment, setKaartMoment] = useState(null);
  useEffect(() => { setKaartMoment(null); }, [spot?.id]);

  const currentData = useMemo(
    () => marine.filter((p) => p.currentSpeed != null).map((p) => ({ t: p.t, _key: p._key, v: p.currentSpeed })),
    [marine]
  );
  const currStr = currentStrength(l.currentSpeed);

  // Temperatuur toggle
  const [tempMode, setTempMode] = useState("air");
  const airTemp   = l.airTemp   ?? null;
  const feelsLike = l.feelsLike ?? null;
  const waterTemp = l.waterTemp ?? null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      overflowY: "auto",
      overflowX: "hidden",
      /* Onderaan ruimte voor de home-indicator: de streep waarmee je op een
         iPhone zonder thuisknop veegt. Die ligt over de app heen, dus zonder
         deze marge valt de onderste grafiek er deels achter en is hij niet
         aan te tikken. */
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      /* Doorschieten aan de randen tegenhouden. Zonder dit trekt Safari bij
         het doorscrollen de héle pagina mee (de rubberband), waardoor de kop
         los van het scherm lijkt te komen — in een geïnstalleerde app leest
         dat als een storing en niet als een gebaar. */
      overscrollBehaviorY: "contain",
      WebkitOverflowScrolling: "touch",
    }}>
      <KaartAchtergrond spot={spot} spots={spots} homeSpotId={homeSpotId} unit={unit} moment={kaartMoment} compact />

      {/* ── HEADER: spot + tijd + LIVE ── */}
      <div style={{
        borderBottom: `2px solid ${C.border}`,
        /* De bovenmarge vangt de statusbalk van de telefoon op. `mobile.html`
           zet `apple-mobile-web-app-status-bar-style` op `black-translucent`,
           wat betekent dat iOS zijn klok, batterij en signaalsterkte *over* de
           app heen tekent in plaats van ernaast. Zonder deze inset staat de
           iPhone-klok boven op de tijd in deze kop — gemeten op een iPhone 14
           begon de kop op y=0.

           Ook links en rechts, want in liggende stand schuift de notch naar de
           zijkant. Op een toestel zonder notch is de inset 0 en verandert er
           niets; `env()` valt dan terug op de tweede waarde. */
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingLeft: "calc(env(safe-area-inset-left, 0px) + 12px)",
        paddingRight: "calc(env(safe-area-inset-right, 0px) + 12px)",
        paddingBottom: 6,
        flexShrink: 0,
      }}>
        {/* Rij 0: spotnaam over de volle breedte. Naast klok, icoon en knoppen
            bleef er op een telefoon zo weinig over dat er "S…" stond. */}
        <div style={{ display: "flex", marginBottom: 2 }}>
          {spots.length > 1 ? (
            <MobileSpotPicker
              spots={spots} selectedId={selectedId} onSelectId={onSelectId}
              favorites={favorites} onToggleFavorite={onToggleFavorite}
              homeSpotId={homeSpotId}
            />
          ) : (
            <span style={{ flex: 1, fontSize: "clamp(18px, 5.5vw, 24px)", fontWeight: 700, color: C.dark }}>
              {spot?.name ?? "—"}
            </span>
          )}
        </div>

        {/* Rij 1: icoon + tijd + LIVE + MAP */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <WeatherIcon code={l.weatherCode ?? null} windSpeed={l.windSpeed} size={64} />
          <span style={{
            fontSize: "clamp(21px, 8vw, 52px)", fontWeight: 900,
            fontVariantNumeric: "tabular-nums", color: C.dark, letterSpacing: "0.04em",
          }}>
            {hh}:{mm}
          </span>
          <button
            onClick={() => hasWebcam && setWebcamOpen((v) => !v)}
            style={{
              border: `2px solid ${webcamOpen ? C.dark : C.border}`,
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
              color: webcamOpen ? C.cream : C.border,
              background: webcamOpen ? C.dark : "transparent",
              opacity: loading ? 0.35 : (!hasWebcam ? 0.25 : 1),
              flexShrink: 0,
              cursor: hasWebcam ? "pointer" : "default",
              outline: "none",
            }}
          >
            {loading ? "…" : webcamOpen ? "✕ CAM" : "LIVE"}
          </button>
          <button
            onClick={() => setRwsMapOpen((v) => !v)}
            style={{
              border: `2px solid ${rwsMapOpen ? C.dark : C.border}`,
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 10, fontWeight: 900, letterSpacing: "0.1em",
              color: rwsMapOpen ? C.cream : C.border,
              background: rwsMapOpen ? C.dark : "transparent",
              flexShrink: 0,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {rwsMapOpen ? "✕" : vertaal("MAP")}
          </button>
        </div>

        {/* Rij 2: wind + richting + temperatuur */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Wind */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <WindArrow deg={l.windDir ?? 0} size={24} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <span style={{ fontSize: "clamp(35px, 9.4vw, 53px)", fontWeight: 900, color: C.dark, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {fmtWind(l.windSpeed, unit)}
                </span>
                {l.windGust != null && (
                  <span style={{ fontSize: "clamp(18px, 4.4vw, 25px)", fontWeight: 600, color: C.border, fontVariantNumeric: "tabular-nums", lineHeight: 1, marginTop: 2 }}>
                    {fmtWind(l.windGust, unit)}
                  </span>
                )}
              </div>
              {spot?.liveAt && (
                <span style={{ fontSize: "clamp(9px, 2.4vw, 13px)", color: C.border, lineHeight: 1.3 }}>
                  {vertaal("updated at:")} {fmtUpdatedAt(spot.liveAt, spot?.utcOffset)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.border, lineHeight: 1.3 }}>{unit}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.border, lineHeight: 1.3 }}>
                {compassDir(l.windDir)}{l.windDir != null ? ` ${l.windDir}°` : ""}
              </span>
            </div>
          </div>

          {/* Temperatuur */}
          {(airTemp != null || waterTemp != null) && (
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {["air", "water"].map((m) => (
                  <button key={m} onClick={() => setTempMode(m)} style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 3,
                    border: `1px solid ${C.border}`,
                    background: tempMode === m ? C.border : "transparent",
                    color: tempMode === m ? C.cream : C.border,
                    cursor: "pointer", fontWeight: tempMode === m ? 700 : 400,
                  }}>
                    {vertaal(m === "air" ? "Air" : "Water")}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: "clamp(18px, 5vw, 24px)", fontWeight: 900, color: C.dark, fontVariantNumeric: "tabular-nums" }}>
                  {tempMode === "air"
                    ? (airTemp != null ? `${airTemp.toFixed(1)}°` : "—")
                    : (waterTemp != null ? `${waterTemp.toFixed(1)}°` : "—")}
                </span>
                <span style={{ fontSize: 10, color: C.border, fontWeight: 600 }}>C</span>
              </div>
              {tempMode === "air" && feelsLike != null && (
                <span style={{ fontSize: 10, color: C.border }}>
                  {vertaal("Feels")} {feelsLike.toFixed(1)}°
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── INFO STRIP ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}44`, flexShrink: 0 }}>
        {[
          {
            label: "DIRECTION",
            value: l.windDir != null ? `${compassDir(l.windDir)} ${l.windDir}°` : "—",
          },
          {
            label: "WAVE Hs",
            value: hs != null ? `${Number(hs).toFixed(1)} m` : "—",
            sub: clean ? `${vertaal("CLEAN")} ${clean.pct}%` : undefined,
            color: clean?.color,
          },
          {
            label: "PERIOD",
            value: (swp ?? tp) != null ? `${Number(swp ?? tp).toFixed(0)}s` : "—",
            sub: quality ? vertaal(quality.label) : undefined,
            color: quality?.color,
          },
        ].map(({ label, value, sub, color }, i, arr) => (
          <div key={label} style={{
            flex: 1,
            padding: "6px 10px",
            borderRight: i < arr.length - 1 ? `1px solid ${C.border}44` : "none",
            display: "flex", flexDirection: "column", gap: 1,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: C.border, lineHeight: 1 }}>
              {vertaal(label)}
            </span>
            <span style={{ fontSize: "clamp(14px, 4vw, 20px)", fontWeight: 700, color: color ?? C.dark, lineHeight: 1.1 }}>
              {value}
            </span>
            {sub && (
              <span style={{ fontSize: 8, fontWeight: 700, color, letterSpacing: "0.04em", lineHeight: 1 }}>
                {sub}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── GRAFIEK TABS + CHART + OVERLAYS ── */}
      {/* `overflow: hidden` als vangnet: wat er ook misgaat met het meten van de
          grafiekhoogte, er mag nooit meer iets buiten dit vak getekend worden.
          Anders belandt het over de weekstrip eronder, en dan lijkt die strip
          verdwenen terwijl hij er gewoon staat. */}
      <div style={{ flex: 1, minHeight: "clamp(220px, 42vh, 420px)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
        <ChartTabs spot={spot} active={activeChart} onChange={setActiveChart} taalKnop={false} />
        {activeChart === "wind" && (
          <WindChart
            past={spot?.windPast}
            live={spot?.windLive}
            forecast={spot?.windForecast}
            unit={unit}
            windDir={l.windDir}
            compact={true}
            liveAt={spot?.liveAt}
            shoreAngle={spot?.shore_angle}
            utcOffset={spot?.utcOffset}
            scrollToDate={scrollTargetDate}
            onSelect={setKaartMoment}
          />
        )}
        {activeChart === "current" && <CurrentChart spot={spot} />}
        {activeChart === "waves"   && <WaveChart spot={spot} waveUnit={waveUnit} />}
        {activeChart === "tide"    && <TideChart spot={spot} />}
        {activeChart === "rain"    && <RainChart spot={spot} />}
        {webcamOpen && (
          <div style={{
            position: "absolute", inset: 0,
            background: "#000",
            zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <WebcamOverlay spot={spot} />
          </div>
        )}
        {rwsMapOpen && (
          <div style={{
            position: "absolute", inset: 0,
            background: "#000",
            zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CurrentMapOverlay spot={spot} />
          </div>
        )}
      </div>

      {/* ── WEEKVERWACHTING ── */}
      <WeekForecast windDaily={spot?.windDaily} unit={unit} compact={true} onDayClick={setScrollTargetDate} utcOffset={spot?.utcOffset} />

      {/* ── EENHEDEN + MODEL ── */}
      <div style={{
        borderTop: `1px solid ${C.border}44`,
        padding: "6px 12px",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 4, marginRight: "auto" }}>
          {UNITS.map((u) => (
            <button key={u} onClick={() => onUnitChange(u)} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 3,
              border: `1px solid ${C.border}`,
              background: unit === u ? C.border : "transparent",
              color: unit === u ? C.cream : C.border,
              cursor: "pointer", fontWeight: unit === u ? 700 : 400,
            }}>
              {u}
            </button>
          ))}
        </div>
        <select
          value={weatherModel}
          onChange={(e) => onModelChange(e.target.value)}
          style={{
            /* Géén `fontSize` hier: die stond op 11px en dat is precies wat
               Safari op iOS laat inzoomen zodra je het veld aantikt — de hele
               pagina wordt vergroot en zoomt niet terug. `index.css` zet hem op
               aanraakschermen op 16px (de iOS-drempel) en laat het wandscherm
               ongemoeid. Een inline waarde zou die regel overrulen. */
            /* Eigen regel onder de knoppen (order), anders bleef er "Aut" over. */
            flex: "1 1 auto", minWidth: 0, order: 2, padding: "4px 6px",
            border: `1px solid ${C.border}`, borderRadius: 4,
            background: C.cream, color: C.dark, cursor: "pointer", outline: "none",
          }}
        >
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button
          onClick={() => onSaveSpotModel?.(spot?.id, weatherModel)}
          title={vertaal(spotModels[spot?.id] === weatherModel ? "Remove favourite model" : "Save as favourite model for this spot")}
          style={{ background: "none", border: "none", padding: "2px 4px", cursor: "pointer", lineHeight: 0, flexShrink: 0, order: 3 }}
        >
          <BreakingWaveIcon active={spotModels[spot?.id] === weatherModel} />
        </button>
        <button
          onClick={() => onThemeToggle?.()}
          style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 3, flexShrink: 0,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.border, cursor: "pointer", fontWeight: 700,
          }}
        >
          {vertaal(isDark ? "LIGHT" : "DARK")}
        </button>
        <button
          onClick={() => zetTaal(huidigeTaal() === "nl" ? "en" : "nl")}
          title="Nederlands / English"
          style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 3, flexShrink: 0,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.border, cursor: "pointer", fontWeight: 700,
          }}
        >
          {huidigeTaal() === "nl" ? "NL" : "EN"}
        </button>
        <button
          onClick={() => onAlarmToggle?.()}
          style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 3, flexShrink: 0,
            border: `2px solid ${alarmMatch ? "#60b8e8" : C.border}`,
            background: "transparent",
            color: alarmMatch ? "#60b8e8" : C.border,
            cursor: "pointer", fontWeight: 700,
            boxShadow: alarmMatch ? "0 0 7px #60b8e866" : "none",
            transition: "box-shadow 0.4s, color 0.3s, border-color 0.3s",
          }}
        >
          ≋ ALARM
        </button>
        <Instellingen spots={spots} homeSpotId={homeSpotId} onHomeSpot={onHomeSpot} onSelectSpot={onSelectId} color={C.border} />
        <div style={{ flexBasis: "100%", height: 0, order: 1 }} />
      </div>

      {/* ── WAVES + ENERGY + CURRENT ── */}
      <div style={{
        borderTop: `2px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}>

        {/* WAVES */}
        <div style={{ padding: "8px 12px 6px", borderBottom: `1px solid ${C.border}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.border }}>{vertaal("WAVES")}</span>
              <button onClick={onWaveUnitToggle} style={{
                fontSize: 10, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.border, cursor: "pointer", letterSpacing: "0.04em", lineHeight: 1.4,
              }}>
                {waveUnit === "m" ? "m·ft" : "ft·m"}
              </button>
            </div>
            {quality && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: quality.color,
                border: `1px solid ${quality.color}`, borderRadius: 2,
                padding: "1px 4px", lineHeight: 1.4,
              }}>
                {vertaal(quality.label)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MiniChart
                data={marine.map((p) => ({
                  t: p.t,
                  _key: p._key,
                  v: waveUnit === "ft" && p.hs != null ? p.hs * M_TO_FT : p.hs,
                  v2: waveUnit === "ft" && p.swh != null ? p.swh * M_TO_FT : p.swh ?? undefined,
                }))}
                unit={waveUnit}
                yTicks={waveUnit === "ft" ? [0, 3, 6, 10] : [0, 1, 2, 3]}
                height={80}
                onActiveChange={setActiveWave}
                v2AsArea
                xKey="_key"
                nowT={marineNowT}
                scrollable
              />
            </div>
            <div style={{
              width: 64, display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "flex-end", gap: 2, flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                {activeWave ? activeWave.t : vertaal("now")}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.dark, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {fmtWave(activeWave ? activeWave.v : hs, waveUnit)}
              </span>
              {(activeWave ? activeWave.v2 != null : swh != null) && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#60b8e8", lineHeight: 1 }}>
                  {fmtWave(activeWave ? activeWave.v2 : swh, waveUnit)}
                </span>
              )}
              {!activeWave && swdir != null && (
                <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                  {compass(swdir)}
                </span>
              )}
              {!activeWave && swellShore && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                  color: swellShore.color, border: `1px solid ${swellShore.color}`,
                  borderRadius: 2, padding: "1px 3px", lineHeight: 1.5,
                }}>
                  {vertaal(swellShore.label)}
                </span>
              )}
            </div>
          </div>
          {startDate !== endDate && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.border, opacity: 0.7, marginTop: 2, paddingRight: 68 }}>
              <span>{fmtShortDate(startDate)}</span>
              <span>{fmtShortDate(endDate)}</span>
            </div>
          )}
        </div>

        {/* ENERGY (kJ) — zelfde als op het wandscherm */}
        <div style={{ padding: "8px 12px 6px", borderBottom: `1px solid ${C.border}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.border }}>{vertaal("ENERGY")}</span>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MiniChart
                data={marine.map((p) => ({ t: p.t, _key: p._key, v: p.energy }))}
                unit="kJ"
                yTicks={[0, 200, 400]}
                height={80}
                onActiveChange={setActiveSwell}
                xKey="_key"
                nowT={marineNowT}
                scrollable
              />
            </div>
            <div style={{
              width: 64, display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "flex-end", gap: 2, flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                {activeSwell ? activeSwell.t : vertaal("now")}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: C.dark }}>
                {(() => {
                  const v = activeSwell ? activeSwell.v : (cm?.energy ?? l.waveEnergy);
                  return v != null ? `${Number(v).toFixed(0)} kJ` : "—";
                })()}
              </span>
              {!activeSwell && swdir != null && (
                <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                  {compass(swdir)}
                </span>
              )}
            </div>
          </div>
          {startDate !== endDate && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.border, opacity: 0.7, marginTop: 2, paddingRight: 68 }}>
              <span>{fmtShortDate(startDate)}</span>
              <span>{fmtShortDate(endDate)}</span>
            </div>
          )}
        </div>

        {/* CURRENT — zelfde als op het wandscherm */}
        {currentData.length > 0 && (
          <div style={{ padding: "8px 12px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.border }}>{vertaal("CURRENT")}</span>
              {currStr && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: currStr.color,
                  border: `1px solid ${currStr.color}`, borderRadius: 2,
                  padding: "1px 4px", lineHeight: 1.4,
                }}>
                  {vertaal(currStr.label)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MiniChart
                  data={currentData}
                  unit="kts"
                  yTicks={[0, 0.5, 1, 1.5, 2]}
                  lineColor={currStr?.color ?? C.border}
                  height={80}
                  onActiveChange={setActiveCurrent}
                  bands={CURRENT_BANDS}
                  xKey="_key"
                  nowT={marineNowT}
                  scrollable
                />
              </div>
              <div style={{
                width: 64, display: "flex", flexDirection: "column",
                justifyContent: "center", alignItems: "flex-end", gap: 2, flexShrink: 0,
              }}>
                <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                  {activeCurrent ? activeCurrent.t : vertaal("now")}
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: currStr?.color ?? C.dark }}>
                  {(() => {
                    const v = activeCurrent ? activeCurrent.v : l.currentSpeed;
                    return v != null ? Number(v).toFixed(1) : "—";
                  })()}
                </span>
                <span style={{ fontSize: 10, color: C.border, lineHeight: 1 }}>
                  kts{!activeCurrent && l.currentDirection != null ? ` ${compass(l.currentDirection)}` : ""}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
