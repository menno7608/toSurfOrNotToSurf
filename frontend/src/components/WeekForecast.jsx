import { useState } from "react";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";
import { t as vertaal, locale } from "../taal.js";
import { spotToday, spotYesterday } from "../time.js";
import { useVenster } from "../tijdvenster.js";

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

export default function WeekForecast({ windDaily = [], unit = "kts", compact = false, onDayClick, utcOffset = 0, hoogte = null }) {
  const C = useTheme();
  const [hoveredDate, setHoveredDate] = useState(null);
  // De dag die in de grafieken in beeld is: het midden van het gedeelde
  // tijdvenster (spotlokale tijd als nep-UTC, dus UTC-datum is de spotdatum).
  const venster = useVenster();
  const bekekenDatum = venster ? new Date((venster.start + venster.eind) / 2).toISOString().slice(0, 10) : null;
  if (!windDaily?.length) return null;

  /* Hier stond `isToday = i === 0`: de eerste kaart heette vandaag, wat die ook
     voor datum droeg. Bij data uit een oude cache stond er dan TODAY boven een
     dag van drie dagen terug, terwijl de grafiek wél naar de echte klok
     scrollde — strip en grafiek liepen zichtbaar uit elkaar. Nu bepaalt de
     datum zelf het label, en wat ouder is dan gisteren tonen we niet meer. */
  const today = spotToday(utcOffset);
  const yesterday = spotYesterday(utcOffset);
  const days = windDaily.filter((d) => d.date >= yesterday);
  if (!days.length) return null;

  // Wandscherm: dagen en getallen moeten vanaf de bank leesbaar zijn.
  // `hoogte` = SPOT INFO + WEATHER MODEL links, inclusief hun 2px-bovenrand.
  // Gemeten op 1920×1080: met cardH = hoogte liggen beide 2px-lijnen op
  // dezelfde pixelrij. Inhoud schaalt mee via k.
  const cardH = compact ? 80 : (hoogte ?? 136);
  const k = compact ? 1 : Math.min(1.3, Math.max(0.85, cardH / 136));
  const z = (px) => Math.round(px * k);

  return (
    <div style={{
      borderTop: `2px solid ${C.border}`,
      display: "flex",
      overflowX: "auto",
      scrollbarWidth: "none",
      flexShrink: 0,
      height: cardH,
    }}>
      {days.map((day) => {
        const date = new Date(day.date + "T12:00:00Z");
        const isToday = day.date === today;
        const isPast = day.date < today;
        const dayLabel = isToday ? vertaal("today") : date.toLocaleDateString(locale(), { weekday: "short", timeZone: "UTC" }).replace(".", "");
        /* Geen weercode betekent: dit model reikt niet tot deze dag. KNMI
           Harmonie stopt na ongeveer drie dagen, Météo-France na vier. Hier
           stond `: "cloudy"`, dus kreeg zo'n dag een bewolkt-icoon — een
           voorspelling die niet bestaat, naast een streepje voor de wind.
           Niets tonen is eerlijker dan iets verzinnen. */
        const iconName = day.weatherCode != null ? (WMO_ICON[day.weatherCode] ?? "cloudy") : null;
        const windVal = day.windMax != null ? convertWind(day.windMax, unit).toFixed(0) : "—";
        const gustVal = day.gustMax != null ? convertWind(day.gustMax, unit).toFixed(0) : null;

        const isHovered = hoveredDate === day.date;
        // Gemarkeerd: de dag die je bekijkt; zonder venster (nog niet versleept) vandaag.
        const isActief = day.date === (bekekenDatum ?? today);
        return (
          <div key={day.date}
            onClick={() => onDayClick?.(day.date)}
            onMouseEnter={() => onDayClick && setHoveredDate(day.date)}
            onMouseLeave={() => setHoveredDate(null)}
            style={{
              flex: "0 0 auto",
              minWidth: compact ? 64 : z(108),
              borderRight: `1px solid ${C.border}44`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "4px 6px",
              cursor: onDayClick ? "pointer" : "default",
              /* Gisteren mag je aanklikken, maar het is geen verwachting meer.
                 Gedimd, zodat de strip blijft laten zien waar nu begint. */
              opacity: isPast ? 0.5 : 1,
              background: isHovered
                ? (isActief ? `${C.border}30` : `${C.border}12`)
                : (isActief ? `${C.border}18` : "transparent"),
              transition: "background 0.15s",
            }}>
            {/* Dag */}
            <span style={{
              fontSize: compact ? 9 : z(15), fontWeight: 700,
              letterSpacing: "0.08em", color: isActief ? C.border : C.dark,
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
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 20 }}>
                {iconName && (
                  <img
                    src={`${import.meta.env.BASE_URL}weather-icons/${iconName}.png`}
                    alt={iconName}
                    style={{ height: 20, width: "auto", objectFit: "contain", marginLeft: -4 }}
                  />
                )}
                {day.tempMax != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.dark }}>
                    {Math.round(day.tempMax)}°
                  </span>
                )}
              </div>
            ) : iconName ? (
              <img
                src={`${import.meta.env.BASE_URL}weather-icons/${iconName}.png`}
                alt={iconName}
                style={{ height: z(50), width: "auto", objectFit: "contain" }}
              />
            ) : (
              /* Vaste hoogte, zodat de kaarten van dagen zonder data even hoog
                 blijven als de rest en de rij niet gaat springen. */
              <div style={{ height: z(50) }} />
            )}

            {/* Wind max + richting */}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {day.windDir != null && <WindArrow deg={day.windDir} size={compact ? 12 : z(20)} />}
              <span style={{ fontSize: compact ? 11 : z(22), fontWeight: 900, color: C.dark, fontVariantNumeric: "tabular-nums" }}>
                {windVal}
              </span>
              {gustVal && (
                <span style={{ fontSize: compact ? 9 : z(15), fontWeight: 700, color: C.orange, fontVariantNumeric: "tabular-nums" }}>
                  {gustVal}
                </span>
              )}
            </div>

            {/* Temperatuur; zonder data een lege regel van gelijke hoogte, zodat
                alle dagnamen op dezelfde hoogte blijven staan. */}
            {!compact && day.tempMax == null && <div style={{ height: z(15) * 1.2 }} />}
            {!compact && day.tempMax != null && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: z(15), fontWeight: 700, color: C.dark }}>
                  {Math.round(day.tempMax)}°
                </span>
                <span style={{ fontSize: z(12), color: C.border, opacity: 0.8 }}>/</span>
                <span style={{ fontSize: z(13), fontWeight: 500, color: C.border }}>
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
        <span style={{ fontSize: compact ? 9 : 12, color: C.border, opacity: 0.7 }}>{unit}</span>
      </div>
    </div>
  );
}
