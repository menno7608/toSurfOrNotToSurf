import { useState, useEffect, useRef } from "react";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";
import { t as vertaal, locale } from "../taal.js";
import { spotToday, spotYesterday } from "../time.js";
import { useVenster } from "../tijdvenster.js";
import { useVuurwerk, VUURWERK_PROEF } from "../vuurwerk.js";
import { Vuurwerk, VuurwerkIcoon, VUURWERK_CSS } from "./Vuurwerk.jsx";

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


const GLOW = "#60b8e8"; // zelfde blauw als de ALARM-gloed

/* Dagen die aan je alarmregels voldoen: blauwe lijn onderaan met zachte gloed en
   een klein vuurwerk-icoontje (blijvend). Het echte vuurwerk (Vuurwerk.jsx)
   tekent boven de weekbalk: één keer per dag bij het openen, en daarna
   herhaald zolang je zo'n dag in de grafiek bekijkt — hoe vaak stel je in bij
   Instellingen. */

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

export default function WeekForecast({ windDaily = [], unit = "kts", compact = false, onDayClick, utcOffset = 0, hoogte = null, matchDays = null }) {
  const C = useTheme();
  const [hoveredDate, setHoveredDate] = useState(null);
  const vw = useVuurwerk();
  const wrapRef = useRef(null);
  const kaartRefs = useRef({});
  const speelRef = useRef(null);
  const laatsteSalvo = useRef(0);
  const salvoTeller = useRef(0);
  const [salvos, setSalvos] = useState([]);
  const aantalMatch = matchDays?.size ?? 0;
  // De dag die in de grafieken in beeld is: het midden van het gedeelde
  // tijdvenster (spotlokale tijd als nep-UTC, dus UTC-datum is de spotdatum).
  const venster = useVenster();
  const bekekenDatum = venster ? new Date((venster.start + venster.eind) / 2).toISOString().slice(0, 10) : null;
  const kijktMatch = !!(bekekenDatum && matchDays?.has(bekekenDatum));

  // 1. Bij het openen van de app, één keer per dag, op de eerste passende dagen.
  useEffect(() => {
    if (!vw.aan || !aantalMatch) return undefined;
    const t = setTimeout(() => {
      const dag = spotToday(utcOffset);
      try {
        if (localStorage.getItem("vuurwerkDatum") === dag) return;
        localStorage.setItem("vuurwerkDatum", dag);
      } catch {
        // geen localStorage: dan elke keer, en dat blijft subtiel
      }
      speelRef.current?.("open");
    }, 900 * vw.duur);
    return () => clearTimeout(t);
  }, [vw.aan, vw.duur, aantalMatch, utcOffset]);

  // 2. Zolang je een passende dag bekijkt: kort na het aankomen, en daarna
  //    elke `vw.elke` seconden (0 = niet herhalen).
  const vorigeDatum = useRef(null);
  useEffect(() => {
    const kwamVanElders = vorigeDatum.current != null && vorigeDatum.current !== bekekenDatum;
    vorigeDatum.current = bekekenDatum;
    if (!vw.aan || !kijktMatch) return undefined;
    const speel = () => speelRef.current?.([bekekenDatum]);
    const aankomst = kwamVanElders ? setTimeout(speel, 900 * vw.duur) : null;
    const herhaal = vw.elke > 0 ? setInterval(speel, vw.elke * 1000) : null;
    return () => { clearTimeout(aankomst); clearInterval(herhaal); };
  }, [vw.aan, vw.elke, vw.duur, kijktMatch, bekekenDatum]);

  // 3. Proefvuurwerk vanuit het instellingenscherm.
  useEffect(() => {
    const proef = () => speelRef.current?.(null, true);
    window.addEventListener(VUURWERK_PROEF, proef);
    return () => window.removeEventListener(VUURWERK_PROEF, proef);
  }, []);

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

  // Speelt een salvo boven de dagkaarten in `datums` ("open" = de eerste drie
  // passende dagen; `proef` = de dag die je nu bekijkt). Nooit twee tegelijk.
  speelRef.current = (datums, proef = false) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!proef && (document.visibilityState !== "visible" || Date.now() - laatsteSalvo.current < 5600 * vw.duur)) return;
    let doel = datums;
    if (datums === "open") doel = days.filter((d) => matchDays?.has(d.date) && d.date >= today).slice(0, 3).map((d) => d.date);
    if (proef || !doel) doel = [bekekenDatum ?? today];
    const wr = wrap.getBoundingClientRect();
    // Het midden van de grafiek erboven: het element vlak boven de weekbalk.
    const grafiek = wrap.previousElementSibling?.getBoundingClientRect();
    let cy = grafiek && grafiek.height > 80 ? grafiek.top + grafiek.height / 2 - wr.top : -170;
    cy = Math.max(cy, 130 - wr.top);      // niet buiten beeld bovenaan
    cy = Math.min(cy, -60);               // altijd boven de weekbalk
    const nieuw = [];
    doel.forEach((datum, i) => {
      const el = kaartRefs.current[datum];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2 - wr.left;
      if (x < 0 || x > wr.width) return;
      // Meerdere dagen: de knallen naast elkaar in het midden van de grafiek.
      const cx = wr.width * (0.5 + (i - (doel.length - 1) / 2) * 0.3);
      // Wandscherm: het salvo groeit mee met de breedte van de grafiek erboven,
      // zodat het daar niet verdwaald klein oogt zoals op een telefoon.
      const schaal = compact ? 1 : Math.min(2.4, Math.max(1, wr.width / 480));
      salvoTeller.current += 1;
      nieuw.push({ id: salvoTeller.current, x, cx, cy: cy - (i % 2) * 30, schaal, duur: vw.duur });
    });
    if (!nieuw.length) return;
    laatsteSalvo.current = Date.now();
    nieuw.forEach((salvo, i) => {
      setTimeout(() => setSalvos((v) => [...v, salvo]), i * 300 * vw.duur);
      setTimeout(() => setSalvos((v) => v.filter((x) => x.id !== salvo.id)), i * 300 * vw.duur + 6200 * vw.duur);
    });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
    {salvos.length > 0 && <style>{VUURWERK_CSS}</style>}
    {salvos.map((salvo) => (
      <div key={salvo.id} style={{ position: "absolute", left: salvo.cx, top: salvo.cy, width: 0, height: 0, zIndex: -5, pointerEvents: "none" }}>
        <Vuurwerk seed={salvo.id} oranje={C.orange} neutraal={C.border} van={{ dx: salvo.x - salvo.cx, dy: -salvo.cy }} schaal={salvo.schaal} duur={salvo.duur} />
      </div>
    ))}
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
        const isMatch = !!matchDays?.has(day.date) && !isPast;
        return (
          <div key={day.date}
            ref={(el) => { kaartRefs.current[day.date] = el; }}
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
              position: "relative",
              boxShadow: isMatch ? `inset 0 -2px 0 ${GLOW}, inset 0 -12px 16px -10px ${GLOW}66` : "none",
              cursor: onDayClick ? "pointer" : "default",
              /* Gisteren mag je aanklikken, maar het is geen verwachting meer.
                 Gedimd, zodat de strip blijft laten zien waar nu begint. */
              opacity: isPast ? 0.5 : 1,
              background: isHovered
                ? (isActief ? `${C.border}30` : `${C.border}12`)
                : (isActief ? `${C.border}18` : "transparent"),
              transition: "background 0.15s",
            }}>
            {isMatch && vw.aan && (
              <div style={{ position: "absolute", top: 3, right: 3, lineHeight: 0 }}>
                <VuurwerkIcoon size={compact ? 13 : z(18)} oranje={C.orange} />
              </div>
            )}
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
    </div>
  );
}
