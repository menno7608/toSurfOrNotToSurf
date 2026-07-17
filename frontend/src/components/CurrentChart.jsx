import { useMemo } from "react";
import MiniChart from "./MiniChart.jsx";
import { useTheme } from "../theme.js";

const CURRENT_BANDS = [
  { y1: 0,   y2: 0.5, fill: "#27ae60", fillOpacity: 0.07 },
  { y1: 0.5, y2: 1.5, fill: "#2980b9", fillOpacity: 0.07 },
  { y1: 1.5, y2: 5.0, fill: "#e07b3a", fillOpacity: 0.07 },
];

function compass(deg) {
  if (deg == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function currentColor(kts) {
  if (kts == null) return "#60b8e8";
  if (kts < 0.5) return "#27ae60";
  if (kts < 1.5) return "#60b8e8";
  return "#fb923c";
}

function currentLabel(kts) {
  if (kts == null) return null;
  if (kts < 0.5) return "WEAK";
  if (kts < 1.5) return "MODERATE";
  return "STRONG";
}

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

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function CurrentChart({ spot }) {
  const C = useTheme();

  const nowMs = Date.now() + (spot?.utcOffset ?? 0) * 1000;
  const marine = useMemo(() => filterMarine(spot?.marine, nowMs), [spot?.marine, nowMs]);
  const marineNowT = useMemo(() => nowKey(marine, nowMs), [marine, nowMs]);

  const data = useMemo(
    () => marine.filter((p) => p.currentSpeed != null).map((p) => ({ ...p, v: p.currentSpeed })),
    [marine]
  );

  const live = spot?.live;
  const liveSpeed = live?.currentSpeed;
  const liveDir   = live?.currentDirection;
  const color     = currentColor(liveSpeed);
  const label     = currentLabel(liveSpeed);

  const startDate = data[0]?.date;
  const endDate   = data[data.length - 1]?.date;

  if (!data.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.border, fontSize: 12 }}>
        No current data available for this spot.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: C.cream, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", borderBottom: `1px solid ${C.border}44`, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>CURRENT</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {liveSpeed != null && (
            <>
              <span style={{ fontSize: 20, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
                {liveSpeed.toFixed(1)} kts
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.border }}>
                {compass(liveDir)} {liveDir != null ? `${liveDir}°` : ""}
              </span>
              {label && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  color, border: `1px solid ${color}`, borderRadius: 3, padding: "2px 5px",
                }}>
                  {label}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chart — neemt alle resterende ruimte */}
      <div style={{ flex: 1, minHeight: 0, padding: "4px 0" }}>
        <MiniChart
          data={data}
          unit="kts"
          yTicks={[0, 0.5, 1, 1.5, 2]}
          lineColor={color}
          height="100%"
          bands={CURRENT_BANDS}
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
