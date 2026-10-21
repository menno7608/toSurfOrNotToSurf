import { useState, useRef, useCallback, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, ReferenceArea, Tooltip,
} from "recharts";
import { useTheme } from "../theme.js";
import { useVenster, zetVenster } from "../tijdvenster.js";
import { t as vertaal } from "../taal.js";

const UUR = 3600 * 1000;
// Zonder melding van de windgrafiek (ander tabblad): drie uur terug, 21 vooruit.
const STANDAARD_TERUG = 3 * UUR, STANDAARD_SPAN = 24 * UUR;

const msVanSleutel = (k) => Date.parse(`${k}:00Z`);   // "2026-10-20T21:00" → nep-UTC ms

function tijdTicks(start, eind) {
  const span = eind - start;
  const stap = span <= 8 * UUR ? 2 * UUR : span <= 16 * UUR ? 3 * UUR : span <= 36 * UUR ? 6 * UUR : 12 * UUR;
  const t = [];
  for (let x = Math.ceil(start / stap) * stap; x <= eind; x += stap) t.push(x);
  return t;
}
const fmtUur = (ms) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

// bands: [{y1, y2, fill, fillOpacity}]
// v2AsArea: toon v2 als gevuld vlak (swell) boven lichte v achtergrond
// nowT: sleutelwaarde waarop oranje "now" stip + lijn getoond wordt
// scrollable: tijd-as gekoppeld aan het gedeelde tijdvenster (tijdvenster.js);
//   slepen of muiswiel verschuift het venster, en de windgrafiek scrolt mee
export default function MiniChart({
  data,
  unit        = "",
  yTicks      = [],
  lineColor,
  secondColor = "#60b8e8",
  height      = 70,
  onActiveChange,
  bands       = [],
  v2AsArea    = false,
  nowT        = null,
  xKey        = null,
  scrollable  = false,
}) {
  const theme  = useTheme();
  const LINE   = theme.border;
  const CREAM  = theme.cream;
  const ORANGE = theme.orange;
  const color  = lineColor ?? LINE;
  const interactive = typeof onActiveChange === "function";
  const [activeIndex, setActiveIndex] = useState(null);
  const gradId = useRef(`mg-${Math.random().toString(36).slice(2, 7)}`).current;

  const bronId = gradId;
  const gekoppeld = scrollable && !!xKey;
  const gedeeld = useVenster();
  const nuMs = nowT && xKey ? msVanSleutel(nowT) : null;
  const venster = gedeeld ?? (nuMs != null ? { start: nuMs - STANDAARD_TERUG, eind: nuMs - STANDAARD_TERUG + STANDAARD_SPAN } : null);
  const vensterRef = useRef(venster);
  vensterRef.current = venster;

  const containerRef = useRef(null);
  const heeftData = !!data?.length;
  const verschuif = useCallback((basis, dtMs) => {
    if (!basis) return;
    zetVenster(basis.start + dtMs, basis.eind + dtMs, bronId);
  }, [bronId]);

  // Muiswiel en slepen (muis én vinger) verschuiven het gedeelde venster.
  // Vinger: alleen als horizontale beweging domineert, anders laten we de
  // verticale scroll van de pagina (naar de volgende grafiek) gewoon doorlopen.
  const sleepRef = useRef(null);
  const msPerPx = () => {
    const v = vensterRef.current, w = containerRef.current?.clientWidth || 1;
    return v ? (v.eind - v.start) / w : 0;
  };
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !gekoppeld) return undefined;
    const wiel = (e) => {
      e.preventDefault();
      const v = vensterRef.current;
      if (v) verschuif(v, Math.sign(e.deltaY || e.deltaX) * (v.eind - v.start) * 0.1);
    };
    const begin = (x, y) => { sleepRef.current = { x, y, basis: vensterRef.current, actief: false }; };
    const beweeg = (x, y, e, aanraking) => {
      const s0 = sleepRef.current;
      if (!s0) return;
      const dx = x - s0.x, dy = y - s0.y;
      if (!s0.actief) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        s0.actief = !aanraking || Math.abs(dx) > Math.abs(dy);
        if (!s0.actief) { sleepRef.current = null; return; }
      }
      if (e.cancelable) e.preventDefault();
      verschuif(s0.basis, -dx * msPerPx());
    };
    const stop = () => { sleepRef.current = null; };
    const md = (e) => begin(e.clientX, e.clientY);
    const mm = (e) => beweeg(e.clientX, e.clientY, e, false);
    const ts = (e) => e.touches.length === 1 && begin(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e) => e.touches.length === 1 && beweeg(e.touches[0].clientX, e.touches[0].clientY, e, true);
    el.addEventListener("wheel", wiel, { passive: false });
    el.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", stop);
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", stop);
    return () => {
      el.removeEventListener("wheel", wiel);
      el.removeEventListener("mousedown", md);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", stop);
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", stop);
    };
  // heeftData: bij de eerste render (nog geen data) bestaat het element nog niet;
  // zonder deze afhankelijkheid werden de handlers daarna nooit meer gekoppeld.
  }, [gekoppeld, verschuif, heeftData]);

  if (!data?.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", fontSize: 11, color: LINE }}>
        {vertaal("No data")}
      </div>
    );
  }

  const isScrollable = gekoppeld && venster != null;
  // Eén punt buiten het venster aan elke kant meenemen, zodat de lijn tot de rand doorloopt.
  const metMs = isScrollable ? data.map((d) => ({ ...d, _ms: msVanSleutel(d[xKey]) })) : data;
  const visible = isScrollable
    ? metMs.filter((d, i) => {
        const vorige = metMs[i + 1]?._ms >= venster.start, volgende = metMs[i - 1]?._ms <= venster.eind;
        return (d._ms >= venster.start || vorige) && (d._ms <= venster.eind || volgende);
      })
    : data;
  const hasV2 = visible.some((d) => d.v2 != null);

  const visibleNowT = isScrollable
    ? (nuMs != null && nuMs >= venster.start && nuMs <= venster.eind ? nuMs : null)
    : nowT;
  const sleutelVan = (d) => (isScrollable ? d?._ms : xKey ? d?.[xKey] : d?.t);

  const handleMove = (e) => {
    if (!interactive) return;
    if (e?.activeTooltipIndex != null) {
      setActiveIndex(e.activeTooltipIndex);
      onActiveChange(visible[e.activeTooltipIndex] ?? null);
    }
  };

  const handleLeave = () => {
    if (!interactive) return;
    setActiveIndex(null);
    onActiveChange(null);
  };

  const activeX = activeIndex != null ? sleutelVan(visible[activeIndex]) : undefined;

  return (
    <div
      ref={containerRef}
      // touch-action: pan-y — zonder dit beslist Chrome op een telefoon zelf wat
      // een vinger doet en pakt hij een licht schuin gebaar over voor paginascroll,
      // waardoor de grafiek niet te verslepen is. Nu krijgt de pagina alleen
      // verticale gebaren; horizontaal is voor het tijdvenster.
      style={{ height, position: "relative", cursor: isScrollable ? "grab" : "default", userSelect: "none", touchAction: gekoppeld ? "pan-y" : undefined }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={visible}
          margin={{ top: 5, right: 4, bottom: 0, left: 0 }}
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={handleLeave}
          onTouchEnd={handleLeave}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          {isScrollable ? (
            <XAxis
              dataKey="_ms" type="number"
              domain={[venster.start, venster.eind]} allowDataOverflow
              ticks={tijdTicks(venster.start, venster.eind)}
              tick={{ fontSize: 11, fill: LINE }}
              axisLine={false} tickLine={false}
              tickFormatter={fmtUur}
            />
          ) : (
            <XAxis
              dataKey={xKey || "t"}
              tick={{ fontSize: 11, fill: LINE }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={xKey ? (v) => (typeof v === "string" ? v.split("T")[1] ?? v : v) : undefined}
            />
          )}
          <YAxis
            tick={{ fontSize: 11, fill: LINE }}
            axisLine={false} tickLine={false}
            ticks={yTicks.length ? yTicks : undefined}
            tickCount={3}
            // Breed genoeg voor de langste ticklabel ("400" bij kJ, "1.5" bij stroom).
            width={Math.max(26, ...yTicks.map((t) => String(t).length * 7 + 8))}
          />
          <Tooltip cursor={false} content={() => null} />
          {bands.map((b, i) => (
            <ReferenceArea key={i} y1={b.y1} y2={b.y2} fill={b.fill} fillOpacity={b.fillOpacity ?? 0.07} stroke="none" />
          ))}
          {yTicks.map((v) => (
            <ReferenceLine key={v} y={v} stroke={LINE} strokeDasharray="3 3" strokeOpacity={0.35} />
          ))}
          {visibleNowT != null && (
            <ReferenceLine x={visibleNowT} stroke={ORANGE} strokeWidth={1.5} strokeOpacity={0.7} />
          )}
          {interactive && activeX != null && (
            <ReferenceLine x={activeX} stroke={LINE} strokeOpacity={0.55} strokeWidth={1} />
          )}
          <Area
            type="monotone" dataKey="v"
            stroke={color} strokeWidth={v2AsArea ? 1 : 1.5}
            strokeOpacity={v2AsArea ? 0.4 : 1}
            fill={`url(#${gradId})`}
            fillOpacity={v2AsArea ? 0.35 : 1}
            dot={visibleNowT != null ? (props) => {
              const key = sleutelVan(props.payload);
              if (key !== visibleNowT || props.cx == null) return <g key={props.index} />;
              return <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={ORANGE} stroke={CREAM} strokeWidth={2} />;
            } : false}
            activeDot={interactive ? { r: 4, fill: color, stroke: color, strokeWidth: 0 } : false}
            isAnimationActive={false}
          />
          {hasV2 && !v2AsArea && (
            <Line
              type="monotone" dataKey="v2"
              stroke={secondColor} strokeDasharray="4 2" strokeWidth={1.5}
              dot={false}
              activeDot={interactive ? { r: 4, fill: secondColor, stroke: secondColor, strokeWidth: 0 } : false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {hasV2 && v2AsArea && (
            <Area
              type="monotone" dataKey="v2"
              stroke={secondColor} strokeWidth={1.5}
              fill={secondColor} fillOpacity={0.4}
              dot={false}
              activeDot={interactive ? { r: 4, fill: secondColor, stroke: secondColor, strokeWidth: 0 } : false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

    </div>
  );
}
