import { useMemo } from "react";
import MiniChart from "./MiniChart.jsx";
import { useTheme } from "../theme.js";

const RAIN_BANDS = [
  { y1: 0,    y2: 0.1,  fill: "#2980b9", fillOpacity: 0.04 },
  { y1: 0.1,  y2: 2.5,  fill: "#2980b9", fillOpacity: 0.08 },
  { y1: 2.5,  y2: 7.6,  fill: "#2980b9", fillOpacity: 0.14 },
  { y1: 7.6,  y2: 50,   fill: "#1a5276", fillOpacity: 0.18 },
];

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function RainChart({ spot }) {
  const C = useTheme();

  const allPoints = useMemo(() => {
    const past     = spot?.windPast     ?? [];
    const live     = spot?.windLive     ?? [];
    const forecast = spot?.windForecast ?? [];
    return [...past, ...live, ...forecast].filter((p) => p.rain != null);
  }, [spot?.windPast, spot?.windLive, spot?.windForecast]);

  const nowMs = Date.now() + (spot?.utcOffset ?? 0) * 1000;

  const data = useMemo(() => {
    if (!allPoints.length) return [];
    const lo = nowMs - 12 * 60 * 60 * 1000;
    const hi = nowMs + 7 * 24 * 60 * 60 * 1000;
    return allPoints
      .filter((p) => {
        const ms = new Date(`${p.date}T${p.t}:00Z`).getTime();
        return ms >= lo && ms <= hi;
      })
      .map((p) => ({ ...p, _key: `${p.date}T${p.t}`, v: p.rain }));
  }, [allPoints, nowMs]);

  const marineNowT = useMemo(() => {
    if (!data.length) return null;
    return data.reduce((best, p) => {
      const diff = Math.abs(new Date(`${p.date}T${p.t}:00Z`).getTime() - nowMs);
      return diff < best.diff ? { key: p._key, diff } : best;
    }, { key: null, diff: Infinity }).key;
  }, [data, nowMs]);

  const totalToday = useMemo(() => {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    return allPoints
      .filter((p) => p.date === today)
      .reduce((sum, p) => sum + (p.rain ?? 0), 0);
  }, [allPoints, nowMs]);

  const startDate = data[0]?.date;
  const endDate   = data[data.length - 1]?.date;

  if (!data.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.border, fontSize: 12 }}>
        Geen neerslagdata beschikbaar.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: C.cream, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", borderBottom: `1px solid ${C.border}44`, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>NEERSLAG</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.border }}>
            vandaag: <strong style={{ color: C.dark }}>{totalToday.toFixed(1)} mm</strong>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, padding: "4px 0" }}>
        <MiniChart
          data={data}
          unit="mm"
          yTicks={[0, 1, 2.5, 5, 10]}
          lineColor="#2980b9"
          height="100%"
          bands={RAIN_BANDS}
          xKey="_key"
          nowT={marineNowT}
          scrollable
        />
      </div>

      {/* Datum footer */}
      {startDate !== endDate && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.border, opacity: 0.5, padding: "0 16px 4px", flexShrink: 0 }}>
          <span>{fmtShortDate(startDate)}</span>
          <span>{fmtShortDate(endDate)}</span>
        </div>
      )}
    </div>
  );
}
