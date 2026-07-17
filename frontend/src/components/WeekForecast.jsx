import { useState } from "react";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";

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

const EN_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function WindArrow({ deg = 0, size = 16 }) {
  const C = useTheme();
  const angle = deg + 90;
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ flexShrink: 0 }}>
      <g transform={`rotate(${angle})`}>
        <line x1={-7} y1={0} x2={5} y2={0} stroke={C.border} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M2,-4 L8,0 L2,4" stroke={C.border} strokeWidth={2} fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function WeekForecast({ windDaily = [], unit = "kts", compact = false, onDayClick }) {
  const C = useTheme();
  const [hoveredDate, setHoveredDate] = useState(null);
  if (!windDaily?.length) return null;

  const cardH = compact ? 80 : 100;

  return (
    <div style={{
      borderTop: `2px solid ${C.border}`,
      backgroundColor: C.cream,
      display: "flex",
      overflowX: "auto",
      scrollbarWidth: "none",
      flexShrink: 0,
      height: cardH,
    }}>
      {windDaily.map((day, i) => {
        const date = new Date(day.date + "T12:00:00Z");
        const isToday = i === 0;
        const dayLabel = isToday ? "today" : EN_DAYS[date.getDay()];
        const iconName = day.weatherCode != null ? (WMO_ICON[day.weatherCode] ?? "cloudy") : "cloudy";
        const windVal = day.windMax != null ? convertWind(day.windMax, unit).toFixed(0) : "—";
        const gustVal = day.gustMax != null ? convertWind(day.gustMax, unit).toFixed(0) : null;

        const isHovered = hoveredDate === day.date;
        return (
          <div key={day.date}
            onClick={() => onDayClick?.(day.date)}
            onMouseEnter={() => onDayClick && setHoveredDate(day.date)}
            onMouseLeave={() => setHoveredDate(null)}
            style={{
              flex: "0 0 auto",
              minWidth: compact ? 64 : 80,
              borderRight: `1px solid ${C.border}44`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "4px 6px",
              cursor: onDayClick ? "pointer" : "default",
              background: isHovered
                ? (isToday ? `${C.border}30` : `${C.border}12`)
                : (isToday ? `${C.border}18` : "transparent"),
              transition: "background 0.15s",
            }}>
            {/* Dag */}
            <span style={{
              fontSize: compact ? 9 : 10, fontWeight: 700,
              letterSpacing: "0.08em", color: isToday ? C.border : C.dark,
              textTransform: "uppercase",
            }}>
              {dayLabel}
            </span>
            {compact && (
              <span style={{ fontSize: 8, color: C.border, opacity: 0.75, lineHeight: 1, marginTop: -1 }}>
                {date.getDate()}/{date.getMonth() + 1}
              </span>
            )}

            {/* Weer-icoon + temperatuur in compact */}
            {compact ? (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <img
                  src={`/weather-icons/${iconName}.png`}
                  alt={iconName}
                  style={{ height: 20, width: "auto", objectFit: "contain", marginLeft: -4 }}
                />
                {day.tempMax != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.dark }}>
                    {Math.round(day.tempMax)}°
                  </span>
                )}
              </div>
            ) : (
              <img
                src={`/weather-icons/${iconName}.png`}
                alt={iconName}
                style={{ height: 26, width: "auto", objectFit: "contain" }}
              />
            )}

            {/* Wind max + richting */}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {day.windDir != null && <WindArrow deg={day.windDir} size={compact ? 12 : 14} />}
              <span style={{ fontSize: compact ? 11 : 13, fontWeight: 900, color: C.dark, fontVariantNumeric: "tabular-nums" }}>
                {windVal}
              </span>
              {gustVal && (
                <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: C.orange, fontVariantNumeric: "tabular-nums" }}>
                  {gustVal}
                </span>
              )}
            </div>

            {/* Temperatuur */}
            {!compact && day.tempMax != null && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>
                  {Math.round(day.tempMax)}°
                </span>
                <span style={{ fontSize: 9, color: C.border, opacity: 0.8 }}>/</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.border }}>
                  {day.tempMin != null ? Math.round(day.tempMin) : "—"}°
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Eenheid label */}
      <div style={{
        display: "flex", alignItems: "flex-end",
        padding: "0 6px 6px 4px", flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: C.border, opacity: 0.7 }}>{unit}</span>
      </div>
    </div>
  );
}
