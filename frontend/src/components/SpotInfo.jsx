import { fmtUpdatedAt } from "../time.js";

const UNITS = ["kts", "m/s", "km/h"];

export default function SpotInfo({ spot, unit = "kts", onUnitChange }) {
  if (!spot) return <div className="text-sm text-slate-500">Loading…</div>;

  const l = spot.live ?? {};

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-slate-700">{spot.name ?? spot.id}</div>
        <select
          value={unit}
          onChange={(e) => onUnitChange?.(e.target.value)}
          className="text-xs border rounded px-1 py-0.5 text-slate-600 bg-white"
        >
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400">
          {spot.updatedAt ? new Date(spot.updatedAt).toLocaleString() : "—"}
        </span>
        {spot.liveAt && (
          <span className="text-xs text-slate-400">
            updated at: {fmtUpdatedAt(spot.liveAt, spot.utcOffset)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="Wind" value={fmtWind(l.windSpeed, unit)} />
        <Metric label="Gust" value={fmtWind(l.windGust, unit)} />
        <Metric label="Dir" value={fmt(l.windDir, "°")} />
        <Metric label="Wave" value={fmt(l.waveHeight, "m")} />
        <Metric label="Period" value={fmt(l.wavePeriod, "s")} />
        <Metric label="Energy" value={fmt(l.waveEnergy, "kJ/m²")} />
        <Metric label="Tide" value={fmt(l.tide, "m")} />
        {l.currentSpeed != null && (
          <Metric label="Current" value={`${l.currentSpeed.toFixed(1)} kts`} sub={fmtCompass(l.currentDirection)} />
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function fmtCompass(deg) {
  if (deg == null) return null;
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return `${dirs[Math.round(deg / 22.5) % 16]} ${deg}°`;
}

function fmt(v, unit) {
  if (v === undefined || v === null) return "—";
  const n = typeof v === "number" ? v.toFixed(1) : v;
  return `${n} ${unit}`;
}

export function convertWind(ms, unit) {
  if (ms === undefined || ms === null) return null;
  if (unit === "kts") return ms * 1.94384;
  if (unit === "km/h") return ms * 3.6;
  return ms; // m/s
}

function fmtWind(ms, unit) {
  if (ms === undefined || ms === null) return "—";
  return `${convertWind(ms, unit).toFixed(1)} ${unit}`;
}
