import { useMemo } from "react";
import MiniChart from "./MiniChart.jsx";
import { useTheme } from "../theme.js";
import { t as vertaal } from "../taal.js";

const TIDE_COLOR = "#2980b9";

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

// Nette symmetrische y-ticks rond 0 op basis van de grootste uitslag
function tideTicks(data) {
  const max = data.reduce((m, p) => Math.max(m, Math.abs(p.v ?? 0)), 0);
  const step = max > 2 ? 1 : 0.5;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = -top; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  return ticks;
}

export default function TideChart({ spot }) {
  const C = useTheme();

  const nowMs = Date.now() + (spot?.utcOffset ?? 0) * 1000;
  const marine = useMemo(() => filterMarine(spot?.marine, nowMs), [spot?.marine, nowMs]);
  const marineNowT = useMemo(() => nowKey(marine, nowMs), [marine, nowMs]);

  const data = useMemo(
    () => marine.filter((p) => p.tide != null).map((p) => ({ ...p, v: p.tide })),
    [marine]
  );

  const nowIdx  = useMemo(() => data.findIndex((p) => p._key === marineNowT), [data, marineNowT]);
  const nowVal  = nowIdx >= 0 ? data[nowIdx].v : (data.length ? data[0].v : null);
  const nextVal = nowIdx >= 0 && nowIdx + 1 < data.length ? data[nowIdx + 1].v : null;
  const trend   = nextVal == null || nowVal == null ? null : (nextVal > nowVal ? "RISING" : "FALLING");

  const yTicks    = useMemo(() => tideTicks(data), [data]);
  const startDate = data[0]?.date;
  const endDate   = data[data.length - 1]?.date;

  if (!data.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.border, fontSize: 12 }}>
        Geen getijdedata beschikbaar voor deze spot.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 4px", borderBottom: `1px solid ${C.border}44`, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.border }}>{vertaal("TIDE")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {nowVal != null && (
            <span style={{ fontSize: 20, fontWeight: 900, color: TIDE_COLOR, fontVariantNumeric: "tabular-nums" }}>
              {nowVal > 0 ? "+" : ""}{nowVal.toFixed(2)} m
            </span>
          )}
          {trend && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: TIDE_COLOR, border: `1px solid ${TIDE_COLOR}`, borderRadius: 3, padding: "2px 5px",
            }}>
              {trend === "RISING" ? `↑ ${vertaal("RISING")}` : `↓ ${vertaal("FALLING")}`}
            </span>
          )}
        </div>
      </div>

      {/* Chart — neemt alle resterende ruimte */}
      <div style={{ flex: 1, minHeight: 0, padding: "4px 0" }}>
        <MiniChart
          data={data}
          unit="m"
          yTicks={yTicks}
          lineColor={TIDE_COLOR}
          height="100%"
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
