import { useMemo, useState } from "react";
import MiniChart from "./MiniChart.jsx";
import { useTheme } from "../theme.js";

const SWELL_BANDS = [
  { y1: 0,  y2: 6,  fill: "#c0392b", fillOpacity: 0.07 },
  { y1: 6,  y2: 10, fill: "#e07b3a", fillOpacity: 0.07 },
  { y1: 10, y2: 14, fill: "#2980b9", fillOpacity: 0.07 },
  { y1: 14, y2: 22, fill: "#27ae60", fillOpacity: 0.07 },
];

const M_TO_FT = 3.28084;

function filterMarine(marine, nowMs) {
  if (!marine?.length || nowMs == null) return [];
  const lo = nowMs -   6 * 60 * 60 * 1000;
  const hi = nowMs + 240 * 60 * 60 * 1000;
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

function waveQuality(period) {
  if (period == null) return null;
  if (period >= 14) return { label: "GROUNDSWELL", color: "#27ae60" };
  if (period >= 10) return { label: "SWELL",       color: "#2980b9" };
  if (period >= 6)  return { label: "WINDSWELL",   color: "#e07b3a" };
  return                   { label: "CHOP",        color: "#c0392b" };
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtWave(m, waveUnit) {
  if (m == null) return "—";
  if (waveUnit === "ft") return `${(m * M_TO_FT).toFixed(1)}ft`;
  return `${Number(m).toFixed(1)}m`;
}

export default function WaveChart({ spot, waveUnit = "m" }) {
  const C = useTheme();

  const [activeWave,  setActiveWave]  = useState(null);
  const [activeSwell, setActiveSwell] = useState(null);
  const [activeEnergy, setActiveEnergy] = useState(null);

  const nowMs = Date.now() + (spot?.utcOffset ?? 0) * 1000;
  const marine = useMemo(() => filterMarine(spot?.marine, nowMs), [spot?.marine, nowMs]);
  const marineNowT = useMemo(() => nowKey(marine, nowMs), [marine, nowMs]);

  const waveData = useMemo(() => marine.map((p) => ({
    ...p,
    v:  waveUnit === "ft" && p.hs  != null ? p.hs  * M_TO_FT : p.hs,
    v2: waveUnit === "ft" && p.swh != null ? p.swh * M_TO_FT : p.swh ?? undefined,
  })), [marine, waveUnit]);

  const periodData = useMemo(() => marine.map((p) => ({
    ...p,
    v: p.swp ?? p.tp,
  })), [marine]);

  const energyData = useMemo(() => marine.map((p) => ({
    ...p,
    v: p.energy,
  })), [marine]);

  const nowEntry = useMemo(() => marine.find((p) => p._key === marineNowT), [marine, marineNowT]);
  const hs     = nowEntry?.hs     ?? spot?.live?.waveHeight;
  const tp     = nowEntry?.tp     ?? spot?.live?.wavePeriod;
  const energy = nowEntry?.energy ?? spot?.live?.waveEnergy;
  const swp = nowEntry?.swp ?? null;
  const quality = waveQuality(swp ?? tp);

  const startDate = marine[0]?.date;
  const endDate   = marine[marine.length - 1]?.date;
  const yTicksWave = waveUnit === "ft" ? [0, 3, 6, 10] : [0, 1, 2, 3];

  if (!marine.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.border, fontSize: 12 }}>
        Geen golfdata beschikbaar voor deze spot.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: C.cream, overflowY: "auto", overflowX: "hidden" }}>

      {/* ── GOLFHOOGTE ── */}
      <div style={{ flex: "0 0 auto", height: 180, display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.border}44` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>GOLFHOOGTE</span>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: C.dark }}>
              {fmtWave(activeWave ? activeWave.v : hs, waveUnit)}
            </span>
            <div style={{ fontSize: 9, color: C.border, opacity: 0.6 }}>
              {activeWave ? activeWave.t : "nu"}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MiniChart
            data={waveData}
            unit={waveUnit}
            yTicks={yTicksWave}
            height="100%"
            v2AsArea
            xKey="_key"
            nowT={marineNowT}
            scrollable
            onActiveChange={setActiveWave}
          />
        </div>
        {startDate !== endDate && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.border, opacity: 0.5, padding: "0 16px 4px", flexShrink: 0 }}>
            <span>{fmtShortDate(startDate)}</span>
            <span>{fmtShortDate(endDate)}</span>
          </div>
        )}
      </div>

      {/* ── SWELL PERIODE ── */}
      <div style={{ flex: "0 0 auto", height: 150, display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.border}44` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>SWELL PERIOD</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: quality?.color ?? C.dark }}>
                {activeSwell
                  ? (activeSwell.v != null ? `${Number(activeSwell.v).toFixed(0)}s` : "—")
                  : ((swp ?? tp) != null ? `${Number(swp ?? tp).toFixed(0)}s` : "—")}
              </span>
              <div style={{ fontSize: 9, color: C.border, opacity: 0.6 }}>
                {activeSwell ? activeSwell.t : "nu"}
              </div>
            </div>
            {quality && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
                color: quality.color, border: `1px solid ${quality.color}`,
                borderRadius: 2, padding: "1px 4px",
              }}>
                {quality.label}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MiniChart
            data={periodData}
            unit="s"
            yTicks={[4, 8, 12, 16]}
            lineColor={quality?.color ?? C.border}
            height="100%"
            bands={SWELL_BANDS}
            xKey="_key"
            nowT={marineNowT}
            scrollable
            onActiveChange={setActiveSwell}
          />
        </div>
      </div>

      {/* ── GOLFENERGIE ── */}
      <div style={{ flex: "0 0 auto", height: 150, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>GOLFENERGIE</span>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: C.dark }}>
              {(activeEnergy ? activeEnergy.v : energy) != null
                ? `${Number(activeEnergy ? activeEnergy.v : energy).toFixed(0)} kJ`
                : "—"}
            </span>
            <div style={{ fontSize: 9, color: C.border, opacity: 0.6 }}>
              {activeEnergy ? activeEnergy.t : "nu"}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MiniChart
            data={energyData}
            unit="kJ"
            yTicks={[0, 100, 200, 400]}
            height="100%"
            xKey="_key"
            nowT={marineNowT}
            scrollable
            onActiveChange={setActiveEnergy}
          />
        </div>
      </div>
    </div>
  );
}
