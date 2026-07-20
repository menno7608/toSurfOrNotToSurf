import { useState, useEffect, useRef } from "react";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";

export const SIDEBAR_W = 320;

const UNITS = ["kts", "m/s", "km/h"];

function BreakingWaveIcon({ active }) {
  const sw = active ? 2.2 : 1.2;
  const op = active ? 1   : 0.38;
  return (
    <svg width="14" height="8" viewBox="0 0 28 16" fill="none" style={{ flexShrink: 0 }}>
      {/* Zon: 2x groter, zelfde middelpunt */}
      <circle cx="5" cy="5" r="4.8" stroke="#7a9db0" strokeWidth={sw * 0.8} opacity={op} />
      {/* Golf buitenkant — horizontale tangent links (C15 15) en rechts (C20 12) */}
      <path d="M11 15 C15 15 18 2 22 4 C25 5 25 11 22 12 C21 12 20 12 19 12"
        stroke="#7a9db0" strokeWidth={sw}
        strokeLinecap="round" strokeLinejoin="round" opacity={op} />
      {/* Golf binnenkant barrel */}
      <path d="M22 5 C24 7 24 10 22 12"
        stroke="#7a9db0" strokeWidth={sw * 0.85}
        strokeLinecap="round" opacity={op} />
    </svg>
  );
}

function SpotDropdown({ spots, selectedId, onSelectId, favorites = [], onToggleFavorite }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const selected = spots.find((s) => s.id === selectedId) ?? spots[0];
  const filtered = search
    ? spots.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spots;

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: "clamp(16px, 2.5vw, 28px)", fontWeight: 700, color: C.dark,
          background: "transparent", border: "none", outline: "none",
          cursor: "pointer", padding: 0, textAlign: "left",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {selected?.name ?? selected?.id ?? "—"}{selected?.subtitle && <span style={{ fontSize: "0.6em", fontWeight: 400, marginLeft: 6, opacity: 0.65 }}>{selected.subtitle}</span>}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 9999,
          background: C.cream, border: `2px solid ${C.border}`, borderRadius: 6,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          minWidth: "100%",
        }}>
          {/* Zoekbalk */}
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}44` }}>
            <input
              autoFocus
              type="text"
              placeholder="Search spot..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 14, padding: "4px 8px", borderRadius: 4,
                border: `1px solid ${C.border}`, background: C.cream,
                color: C.dark, outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
            {filtered.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center",
                  borderBottom: `1px solid ${C.border}22`,
                  background: "transparent",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${C.border}22`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div
                  onMouseDown={() => { onSelectId(s.id); setOpen(false); }}
                  style={{
                    flex: 1, padding: "10px 18px",
                    fontSize: 18, fontWeight: s.id === selectedId ? 700 : 400,
                    color: s.id === selectedId ? C.border : C.dark,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {s.name ?? s.id}{s.subtitle && <span style={{ fontSize: "0.65em", fontWeight: 400, marginLeft: 6, opacity: 0.65 }}>{s.subtitle}</span>}
                </div>
                <div
                  onMouseDown={(e) => { e.stopPropagation(); onToggleFavorite(s.id); }}
                  style={{ padding: "10px 14px 10px 4px", cursor: "pointer" }}
                >
                  <BreakingWaveIcon active={favorites.includes(s.id)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// WMO-code → bestandsnaam van het losse icoon in /weather-icons/
const WMO_ICON = {
  0: "sunny",        1: "partly-cloudy", 2: "partly-cloudy", 3: "overcast",
  45: "haze",        48: "fog",
  51: "showers",     53: "rain",         55: "rain",
  61: "rain",        63: "rain",         65: "heavy-rain",
  66: "sleet",       67: "sleet",
  71: "snow",        73: "snow",         75: "snow",         77: "snow",
  80: "showers",     81: "rain",         82: "storm",
  85: "snow",        86: "snow",
  95: "thunderstorm", 96: "hail",        99: "hail",
};

function WeatherIcon({ code, windSpeed }) {
  let name = code != null ? WMO_ICON[code] : null;
  if (!name) name = "cloudy";
  if ((code === 0 || code === 1) && windSpeed != null && windSpeed > 12) name = "windy";
  return (
    <img
      src={`/weather-icons/${name}.png`}
      alt={name}
      style={{
        // Absoluut gepositioneerd: het icoon schaalt mee met de headerhoogte,
        // maar bepaalt die nooit zelf (de PNG's zijn intrinsiek 400px hoog).
        position: "absolute",
        // Expliciete maten: bij auto zou de browser de intrinsieke PNG-maat
        // pakken en right/bottom negeren, waardoor het icoon uit beeld loopt.
        top: "4%", left: 8,
        width: "calc(100% - 16px)", height: "92%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

function WindArrow({ deg = 0, size = 28 }) {
  const C = useTheme();
  const angle = deg + 90;
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ color: C.border, flexShrink: 0 }}>
      <g transform={`rotate(${angle})`}>
        <line x1={-9} y1={0} x2={7} y2={0} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        <path d="M3,-5 L10,0 L3,5" stroke="currentColor" strokeWidth={2.5} fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function Header({ spot, spots, selectedId, onSelectId, unit, onUnitChange, loading = false, favorites = [], onToggleFavorite, webcamOpen = false, onWebcamToggle, rwsMapOpen = false, onRwsMapToggle, autoRotate = false, onAutoRotateToggle, canAutoRotate = false, isDark = false, onThemeToggle, sunrise, sunset, alarmMatch = false, onAlarmToggle }) {
  const C = useTheme();
  const [time, setTime] = useState(new Date());
  const [tempMode, setTempMode] = useState("air"); // "air" | "water"

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");

  const windSpeed = spot?.live?.windSpeed;
  const windGust  = spot?.live?.windGust;
  const windDir   = spot?.live?.windDir ?? 0;
  const windValue = windSpeed != null ? convertWind(windSpeed, unit).toFixed(1) : "—";
  const gustValue = windGust  != null ? convertWind(windGust,  unit).toFixed(1) : null;
  const spotName  = spot?.name ?? "—";
  const liveAt    = spot?.liveAt;

  const airTemp     = spot?.live?.airTemp;
  const feelsLike   = spot?.live?.feelsLike;
  const waterTemp   = spot?.live?.waterTemp;
  const weatherCode = spot?.live?.weatherCode ?? null;

  const fmtT = (v) => v != null ? `${v.toFixed(1)}` : "—";

  return (
    <div style={{ display: "flex", borderBottom: `2px solid ${C.border}`, backgroundColor: C.cream, flexShrink: 0, position: "relative", zIndex: 100 }}>

      {/* ── TIME (zelfde breedte als sidebar) ── */}
      <div style={{
        width: "clamp(230px, 24vw, 360px)", flexShrink: 0, boxSizing: "border-box",
        padding: "6px clamp(8px, 1.5vw, 20px)",
        borderRight: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 1,
        overflow: "hidden",
      }}>
        <span style={{ fontSize: "clamp(8px, 1vw, 11px)", fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>
          TIME
        </span>
        <span style={{
          fontSize: "clamp(32px, 6vw, 80px)", fontWeight: 900, fontVariantNumeric: "tabular-nums",
          lineHeight: 1, color: C.dark, letterSpacing: "0.04em",
        }}>
          {hh}:{mm}
        </span>
      </div>

      {/* ── TEMPERATUUR ── */}
      <div style={{
        width: "clamp(90px, 12vw, 180px)", flexShrink: 0, boxSizing: "border-box",
        padding: "6px clamp(4px, 0.7vw, 8px)",
        borderRight: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
        overflow: "hidden",
      }}>
        <span style={{ fontSize: "clamp(8px, 1vw, 11px)", fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>
          TEMPERATURE
        </span>

        {/* Hoofdwaarde */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 1, alignSelf: "flex-start" }}>
          <span style={{
            fontSize: "clamp(22px, 4vw, 52px)", fontWeight: 900, lineHeight: 1, color: C.dark,
            fontVariantNumeric: "tabular-nums",
          }}>
            {tempMode === "air" ? fmtT(airTemp) : fmtT(waterTemp)}
          </span>
          <span style={{ fontSize: "clamp(14px, 2.2vw, 26px)", color: C.border, fontWeight: 600 }}>°C</span>
        </div>

        {/* Gevoelstemperatuur (alleen bij lucht) */}
        {tempMode === "air" && (
          <div style={{ fontSize: "clamp(10px, 1.1vw, 13px)", color: C.border }}>
            Feels like: <strong style={{ color: C.dark }}>{fmtT(feelsLike)}</strong>
          </div>
        )}

        {/* Lucht / Water toggle */}
        <div style={{ display: "flex", gap: 3 }}>
          {["air", "water"].map((m) => (
            <button key={m} onClick={() => setTempMode(m)} style={{
              fontSize: "clamp(9px, 1vw, 11px)", padding: "2px 6px", borderRadius: 3,
              border: `1px solid ${C.border}`,
              background: tempMode === m ? C.border : "transparent",
              color: tempMode === m ? C.cream : C.border,
              cursor: "pointer", fontWeight: tempMode === m ? 700 : 400,
            }}>
              {m === "air" ? "Air" : "Water"}
            </button>
          ))}
        </div>
      </div>

      {/* ── WIND ACTUEEL ── */}
      <div style={{
        flexShrink: 0, boxSizing: "border-box",
        padding: "6px clamp(8px, 1.5vw, 20px)",
        borderRight: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
      }}>
        <span style={{ fontSize: "clamp(8px, 1vw, 11px)", fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>
          WIND
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 10px)" }}>
          <WindArrow deg={windDir} size={26} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
            <span style={{
              fontSize: "clamp(22px, 3.8vw, 50px)", fontWeight: 900, lineHeight: 1, color: C.dark,
              fontVariantNumeric: "tabular-nums",
            }}>
              {windValue}
            </span>
            {gustValue && (
              <span style={{
                fontSize: "clamp(13px, 2vw, 26px)", fontWeight: 700, lineHeight: 1,
                color: "#c07a3a", fontVariantNumeric: "tabular-nums", marginTop: 3,
              }}>
                {gustValue}
              </span>
            )}
          </div>
          <span style={{ fontSize: "clamp(12px, 1.4vw, 18px)", fontWeight: 600, color: C.border, alignSelf: "flex-end", paddingBottom: 2 }}>
            {unit}
          </span>
        </div>

        <div style={{ display: "flex", gap: 3 }}>
          {UNITS.map((u) => (
            <button key={u} onClick={() => onUnitChange(u)} style={{
              fontSize: "clamp(9px, 1vw, 11px)", padding: "2px 6px", borderRadius: 3,
              border: `1px solid ${C.border}`,
              background: unit === u ? C.border : "transparent",
              color: unit === u ? C.cream : C.border,
              cursor: "pointer", fontWeight: unit === u ? 700 : 400,
            }}>
              {u}
            </button>
          ))}
        </div>
      </div>


      {/* ── WEATHER ICON ── */}
      <div style={{
        flex: 1,
        alignSelf: "stretch",
        position: "relative",
        minWidth: 0,
        overflow: "hidden",
      }}>
        {weatherCode != null && (
          <WeatherIcon code={weatherCode} windSpeed={windSpeed} />
        )}
      </div>

      {/* ── SPOT NAME ── */}
      <div style={{
        flexShrink: 0,
        padding: "10px clamp(10px, 2vw, 24px)",
        borderLeft: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
        overflow: "visible", position: "relative",
      }}>
        <span style={{ fontSize: "clamp(8px, 1vw, 10px)", fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>
          SPOT NAME
        </span>
        {spots.length > 1 ? (
          <SpotDropdown
            spots={spots}
            selectedId={selectedId}
            onSelectId={onSelectId}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />
        ) : (
          <span style={{ fontSize: "clamp(16px, 2.5vw, 28px)", fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {spotName}{spot?.subtitle && <span style={{ fontSize: "0.6em", fontWeight: 400, marginLeft: 6, opacity: 0.65 }}>{spot.subtitle}</span>}
          </span>
        )}
      </div>

      {/* ── LIVE / CAM / AUTO TOGGLE ── */}
      <div style={{
        width: "clamp(60px, 10vw, 150px)", flexShrink: 0,
        borderLeft: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        padding: "6px 0",
      }}>
        <button
          onClick={() => onWebcamToggle?.()}
          style={{
            border: `2px solid ${webcamOpen ? C.dark : C.border}`,
            borderRadius: 4,
            padding: "6px clamp(8px, 1.5vw, 18px)",
            fontSize: "clamp(10px, 1.1vw, 13px)", fontWeight: 900,
            letterSpacing: "0.12em",
            color: webcamOpen ? C.cream : C.border,
            background: webcamOpen ? C.dark : "transparent",
            opacity: loading ? 0.4 : 1, transition: "opacity 0.3s, background 0.15s, color 0.15s",
            cursor: "pointer", outline: "none",
          }}
        >
          {loading ? "..." : webcamOpen ? "✕ CAM" : "LIVE"}
        </button>
        <button
          onClick={() => onRwsMapToggle?.()}
          style={{
            border: `2px solid ${rwsMapOpen ? C.dark : C.border}`,
            borderRadius: 4,
            padding: "4px clamp(6px, 1.2vw, 14px)",
            fontSize: "clamp(9px, 0.9vw, 11px)", fontWeight: 900,
            letterSpacing: "0.12em",
            color: rwsMapOpen ? C.cream : C.border,
            background: rwsMapOpen ? C.dark : "transparent",
            transition: "background 0.15s, color 0.15s",
            cursor: "pointer", outline: "none",
          }}
        >
          {rwsMapOpen ? "✕ MAP" : "MAP"}
        </button>
        {liveAt && (
          <span style={{ fontSize: "clamp(8px, 0.8vw, 10px)", color: C.border, opacity: 0.75 }}>
            {liveAt.slice(11, 16)}
          </span>
        )}
        <button
          onClick={() => onAutoRotateToggle?.()}
          disabled={!canAutoRotate}
          title={canAutoRotate ? "Auto-rotate favourites (30s)" : "Add ≥2 favourites"}
          style={{
            border: `2px solid ${autoRotate ? C.dark : C.border}`,
            borderRadius: 4,
            padding: "4px clamp(6px, 1.2vw, 14px)",
            fontSize: "clamp(9px, 0.9vw, 11px)", fontWeight: 900,
            letterSpacing: "0.12em",
            color: autoRotate ? C.cream : C.border,
            background: autoRotate ? C.dark : "transparent",
            opacity: canAutoRotate ? 1 : 0.3,
            transition: "opacity 0.3s, background 0.15s, color 0.15s",
            cursor: canAutoRotate ? "pointer" : "default", outline: "none",
          }}
        >
          {autoRotate ? "⏸ AUTO" : "▶ AUTO"}
        </button>
        <button
          onClick={() => onThemeToggle?.()}
          title={(() => {
            const fmt = (d) => d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?";
            return isDark
              ? `Switch to light mode\nAuto: sunrise at ${fmt(sunrise)}`
              : `Switch to dark mode\nAuto: sunset at ${fmt(sunset)}`;
          })()}
          style={{
            border: `2px solid ${C.border}`,
            borderRadius: 4,
            padding: "4px clamp(6px, 1.2vw, 14px)",
            fontSize: "clamp(9px, 0.9vw, 11px)", fontWeight: 900,
            letterSpacing: "0.12em",
            color: C.border,
            background: "transparent",
            cursor: "pointer", outline: "none",
          }}
        >
          {isDark ? "LIGHT" : "DARK"}
          <span style={{ fontSize: "0.75em", opacity: 0.55, marginLeft: 2 }}>·AUTO</span>
        </button>
        <button
          onClick={() => onAlarmToggle?.()}
          title="Alarmregels instellen"
          style={{
            border: `2px solid ${alarmMatch ? "#60b8e8" : C.border}`,
            borderRadius: 4,
            padding: "4px clamp(6px, 1.2vw, 14px)",
            fontSize: "clamp(9px, 0.9vw, 11px)", fontWeight: 900,
            letterSpacing: "0.12em",
            color: alarmMatch ? "#60b8e8" : C.border,
            background: "transparent",
            cursor: "pointer", outline: "none",
            boxShadow: alarmMatch ? "0 0 8px #60b8e866" : "none",
            transition: "box-shadow 0.4s, color 0.3s, border-color 0.3s",
          }}
        >
          ≋ ALARM
        </button>
      </div>
    </div>
  );
}
