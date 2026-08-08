import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from "recharts";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";
import WindDirectionBadge from "./WindDirectionBadge.jsx";

const FORECAST = "#60b8e8";
const ARROW    = "#3d7fa8";

const PX_PER_HOUR = 72;

// Kitesurfen referentiewaarden in kts
const REFS = [
  { kts: 14 },
  { kts: 24 },
  { kts: 38 },
];

const MIN_Y = 15; // minimum Y-schaal zodat kalme dagen niet over-ingezoomd worden

// Round max up to a clean tick boundary with ~15% headroom
function niceYMax(rawMax) {
  if (rawMax <= 0) return 20;
  const padded = rawMax * 1.15;
  if (padded <= 25) return Math.ceil(padded / 5)  * 5;
  if (padded <= 65) return Math.ceil(padded / 10) * 10;
  return             Math.ceil(padded / 20) * 20;
}

// ── Piek / dal detectie ────────────────────────────────────────────────────────
function isPeak(data, key, i) {
  const v = data[i]?.[key]; if (v == null) return false;
  const p = data[i - 1]?.[key]; const n = data[i + 1]?.[key];
  return (p == null || v > p) && (n == null || v >= n);
}
function isValley(data, key, i) {
  const v = data[i]?.[key]; if (v == null) return false;
  const p = data[i - 1]?.[key]; const n = data[i + 1]?.[key];
  return (p == null || v < p) && (n == null || v <= n);
}

// ── SVG elementen ──────────────────────────────────────────────────────────────
function ArrowDot({ cx, cy, windDir = 90 }) {
  if (cx == null || cy == null) return null;
  const s = 9;
  return (
    <g transform={`translate(${cx},${cy}) rotate(${windDir + 90})`}>
      <line x1={-s} y1="0" x2={s - 2} y2="0" stroke={ARROW} strokeWidth="2" strokeLinecap="round" />
      <path d={`M${s-5},-${(s*.55).toFixed(1)} L${s+1},0 L${s-5},${(s*.55).toFixed(1)}`}
        stroke={ARROW} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function OrangeDot({ cx, cy, orange, cream }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={7} fill={orange} stroke={cream} strokeWidth={2.5} />;
}

// onlyMeasured: toon pijlen alleen voor origineel gemeten punten (past/live), niet voor verstreken forecast
function makeDot({ data, dataKey, liveIdx, windDir, unit, compact, dark, orange, cream, onlyMeasured = false }) {
  const fs  = compact ? 10 : 13;
  const yUp = compact ? -14 : -17;
  const yDn = compact ?  18 :  22;
  return function Dot({ cx, cy, index }) {
    if (cx == null || cy == null) return null;
    if (index === liveIdx) return <OrangeDot cx={cx} cy={cy} orange={orange} cream={cream} />;
    if (onlyMeasured && !data[index]?._origMeasured) return null;

    const isNeighbor = index === liveIdx - 1 || index === liveIdx + 1;
    const pk  = !isNeighbor && isPeak(data, dataKey, index);
    const vl  = !isNeighbor && isValley(data, dataKey, index);
    const val = data[index]?.[dataKey];

    return (
      <g>
        <ArrowDot cx={cx} cy={cy} windDir={data[index]?._dir ?? windDir} />
        {(pk || vl) && val != null && (
          <text
            x={cx} y={pk ? cy + yUp : cy + yDn}
            textAnchor="middle" fontSize={fs} fontWeight={700} fill={dark}
          >
            {Number(val).toFixed(1)} {unit}
          </text>
        )}
      </g>
    );
  };
}

function makeGustDot({ data, liveIdx, unit, compact, gust }) {
  const fs  = compact ? 10 : 13;
  const yUp = compact ? -6 : -8;
  const yDn = compact ? 14 : 17;
  return function Dot({ cx, cy, index }) {
    if (cx == null || cy == null) return null;
    if (index === liveIdx) return null;
    const isNeighbor = index === liveIdx - 1 || index === liveIdx + 1;
    if (isNeighbor) return null;
    const pk  = isPeak(data, "stoot", index);
    const vl  = isValley(data, "stoot", index);
    const val = data[index]?.["stoot"];
    if ((!pk && !vl) || val == null) return null;
    return (
      <text
        x={cx} y={pk ? cy + yUp : cy + yDn}
        textAnchor="middle" fontSize={fs} fontWeight={600} fill={gust}
      >
        {Number(val).toFixed(1)} {unit}
      </text>
    );
  };
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────────
export default function WindChart({ past, live, forecast, unit = "kts", windDir = 90, compact = false, liveAt = null, shoreAngle = null, utcOffset = 0, scrollToDate = null }) {
  const theme = useTheme();
  const LINE   = theme.border;
  const CREAM  = theme.cream;
  const DARK   = theme.dark;
  const ORANGE = theme.orange;
  const GUST   = theme.gust;

  const scrollRef = useRef(null);
  const windowWheelRef = useRef(null);

  // Ruim window-listener op bij unmount (voor het geval muis nog boven grafiek zweeft)
  useEffect(() => () => {
    if (windowWheelRef.current) window.removeEventListener("wheel", windowWheelRef.current);
  }, []);
  const [chartH, setChartH] = useState(260);

  // Meet de hoogte van de scroll-container en gebruik die voor de chart
  useEffect(() => {
    if (!scrollRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      // Compact: geen footer, alleen dag-strip (36px SVG, overlapt 16px → netto 20px).
      // Normaal: footer (~20px) + dag-strip (20px netto) = 40px aftrek.
      const overhead = compact ? 20 : 40;
      if (h > 40) setChartH(Math.max(80, h - overhead));
    });
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);

  const allRows = useMemo(() => [
    ...(past     ?? []).map((x) => ({ ...x, kind: "past" })),
    ...(live     ?? []).map((x) => ({ ...x, kind: "live" })),
    ...(forecast ?? []).map((x) => ({ ...x, kind: "fcst" })),
  ], [past, live, forecast]);

  // liveIdx = het API-datapunt dat als "live" is gemarkeerd (laatste meting)
  const liveIdx = allRows.findIndex((r) => r.kind === "live");

  // Houd de huidige tijd bij en update elke minuut
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // nowIdx = het datapunt dat het dichtst bij de actuele klok ligt
  // t/date zijn spotlokale tijden; vergelijk als "nep-UTC" door utcOffset op te tellen bij now.
  const nowIdx = useMemo(() => {
    if (!allRows.length) return liveIdx;
    const nowMs = now.getTime() + (utcOffset ?? 0) * 1000;
    let best = { idx: liveIdx, diff: Infinity };
    allRows.forEach((r, i) => {
      if (!r.t || !r.date) return;
      const ms = new Date(`${r.date}T${r.t}:00Z`).getTime();
      const diff = Math.abs(ms - nowMs);
      if (diff < best.diff) best = { idx: i, diff };
    });
    return best.idx;
  }, [allRows, now, liveIdx, utcOffset]);

  const totalPts = allRows.length;
  const chartW   = Math.max(800, totalPts * PX_PER_HOUR);

  useEffect(() => {
    if (scrollToDate) return;
    if (!scrollRef.current || nowIdx < 0) return;
    const LEFT_OFFSET  = 4;
    const RIGHT_OFFSET = 24;
    const plotW = chartW - LEFT_OFFSET - RIGHT_OFFSET;
    const nowX  = LEFT_OFFSET + (nowIdx / Math.max(totalPts - 1, 1)) * plotW;

    const el = scrollRef.current;
    const doScroll = () => {
      if (el.clientWidth > 0) el.scrollLeft = nowX - el.clientWidth / 2;
    };

    // Scroll zodra de container zijn breedte heeft (betrouwbaar op alle apparaten)
    const ro = new ResizeObserver(() => { doScroll(); ro.disconnect(); });
    ro.observe(el);
    doScroll(); // ook meteen proberen als al gesized

    return () => ro.disconnect();
  }, [nowIdx, totalPts, chartW, scrollToDate]);

  // Dynamische tijdssplitsing: alles t/m nowIdx = verleden (area), alles vanaf nowIdx = verwacht (lijn).
  // Bridge op nowIdx krijgt beide waarden zodat area en lijn visueel naadloos aansluiten.
  // _origMeasured = origineel gemeten (past/live) → bepaalt welke punten een pijl-dot krijgen.
  // _measured     = dynamisch (≤ nowIdx) → bepaalt tooltip-weergave (verleden vs. forecast).
  const data = useMemo(() => allRows.map((r, i) => {
    const isNow    = i === nowIdx;
    const isFuture = i > nowIdx;
    return {
      _idx:         i,
      t:            r.t,
      date:         r.date,
      _measured:    !isFuture,
      _origMeasured: r.kind === "past" || r.kind === "live",
      _dir:         r.dir ?? null,
      verleden:     !isFuture ? cvt(r.v, unit) : undefined,
      verwacht:     (isFuture || isNow) ? cvt(r.v, unit) : undefined,
      stoot:        r.g != null ? cvt(r.g, unit) : undefined,
    };
  }), [allRows, unit, nowIdx]);

  const noonIdx = useMemo(() => {
    if (!scrollToDate) return null;
    let best = null, bestDiff = Infinity;
    data.forEach((row, i) => {
      if (row.date !== scrollToDate) return;
      const [h = 0, m = 0] = (row.t ?? "00:00").split(":").map(Number);
      const diff = Math.abs(h * 60 + m - 720);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }, [scrollToDate, data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (noonIdx == null || !scrollRef.current) return;
    const el = scrollRef.current;
    const plotW = chartW - LEFT_OFFSET - RIGHT_OFFSET;
    const x = LEFT_OFFSET + (noonIdx / Math.max(totalPts - 1, 1)) * plotW;
    el.scrollLeft = x - el.clientWidth / 2;
  }, [noonIdx, chartW, totalPts]);

  // Detecteer dag-overgangen: t=00:00 of eerste punt van een nieuwe datum
  const dayChanges = useMemo(() => {
    const seen = new Set();
    return data.reduce((acc, row) => {
      if (row.date && !seen.has(row.date)) {
        seen.add(row.date);
        if (seen.size > 1) acc.push(row);
      }
      return acc;
    }, []);
  }, [data]);

  const dayChangeSet = useMemo(
    () => new Set(dayChanges.map((r) => r.t)),
    [dayChanges]
  );
  const dateByTime = useMemo(() => {
    const m = {};
    dayChanges.forEach((r) => { m[r.t] = r.date; });
    return m;
  }, [dayChanges]);

  const LEFT_OFFSET = 4;
  const RIGHT_OFFSET = 24;

  const dayBands = useMemo(() => {
    const plotW = chartW - LEFT_OFFSET - RIGHT_OFFSET;
    const xOf = (i) => LEFT_OFFSET + (i / Math.max(totalPts - 1, 1)) * plotW;

    // Verzamel de index van het eerste punt van elke nieuwe dag (= 00:00 grenzen)
    const boundaries = []; // { date, idx }
    let curDate = null;
    data.forEach((row, i) => {
      if (row.date !== curDate) {
        boundaries.push({ date: row.date, idx: i });
        curDate = row.date;
      }
    });

    return boundaries.map((b, bi) => {
      const nextB = boundaries[bi + 1];
      return {
        date:    b.date,
        x1:      xOf(b.idx),
        x2:      nextB ? xOf(nextB.idx) : xOf(data.length - 1),
        hasLeft: bi > 0,          // eerste dag heeft geen linker 00:00-grens
        hasRight: !!nextB,        // laatste dag heeft geen rechter 00:00-grens
      };
    });
  }, [data, chartW, totalPts]);

  // XAxis gebruikt numerieke _idx → payload.value is de index; tijdlabel opzoeken in data
  const XTick = useMemo(() => function Tick({ x, y, payload }) {
    const row = data[payload.value];
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill={LINE}>
        {row?.t ?? ""}
      </text>
    );
  }, [data, LINE]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveT  = allRows.find((r) => r.kind === "live")?.t ?? null;
  const fcstT  = allRows.find((r) => r.kind === "fcst")?.t ?? null;

  const refs   = REFS.map((r) => ({
    val:   parseFloat(convertWind(r.kts, unit).toFixed(1)),
    label: `${parseFloat(convertWind(r.kts, unit).toFixed(1))} ${unit}`,
  }));

  const yDomain = useMemo(() => {
    const vals = data.flatMap((d) => [d.verleden, d.verwacht].filter((v) => v != null));
    if (!vals.length) return [0, 20];
    return [0, niceYMax(Math.max(MIN_Y, ...vals))];
  }, [data]);

  // Gecentreerde Y-as tick: tekst staat even ver van linker- als rechterkant van het Y-as paneel
  const yAxisPanelW = compact ? 28 : 42;

  // Handmatige SVG Y-as — exacte pixel-uitlijning met hoofdgrafiek
  // Marges zijn identiek aan de ComposedChart: top=16, bottom=20, XAxis height=36
  const CHART_MARGIN_TOP  = 16;
  const CHART_MARGIN_BOT  = 20;
  const XAXIS_H           = 36;
  const plotTop    = CHART_MARGIN_TOP;
  const plotBottom = useMemo(() => chartH - CHART_MARGIN_BOT - XAXIS_H, [chartH]);
  const plotHeight = useMemo(() => plotBottom - plotTop, [plotBottom]);

  const yTicks = useMemo(() => {
    const [, yMax] = yDomain;
    const step = yMax <= 25 ? 5 : yMax <= 65 ? 10 : 20;
    const ticks = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yDomain]);

  // Only show reference lines that fall within the current Y scale
  const visibleRefs = useMemo(() => refs.filter((r) => r.val <= yDomain[1]), [refs, yDomain]);

  const yOf = useCallback((v) => {
    const [, yMax] = yDomain;
    return plotTop + (1 - v / yMax) * plotHeight;
  }, [yDomain, plotTop, plotHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const VerledenDot = useMemo(
    () => makeDot({ data, dataKey: "verleden", liveIdx: nowIdx, windDir, unit, compact, dark: DARK, orange: ORANGE, cream: CREAM, onlyMeasured: true }),
    [data, nowIdx, windDir, unit, compact, DARK, ORANGE, CREAM] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const VerwachtDot = useMemo(
    () => makeDot({ data, dataKey: "verwacht", liveIdx: nowIdx, windDir, unit, compact, dark: DARK, orange: ORANGE, cream: CREAM }),
    [data, nowIdx, windDir, unit, compact, DARK, ORANGE, CREAM] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const GustDot = useMemo(
    () => makeGustDot({ data, liveIdx: nowIdx, unit, compact, gust: GUST }),
    [data, nowIdx, unit, compact, GUST] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const hasKnmi = allRows.some((r) => r.src === "knmi");

  if (!allRows.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: LINE, fontSize: 13 }}>
        No wind data
      </div>
    );
  }

  return (
    /* `minHeight: 0` is hier geen detail. Een flex-item mag standaard niet
       kleiner worden dan zijn inhoud, dus zonder deze regel hield deze kolom
       vast aan de hoogte die de grafiek wil hebben. Kreeg hij van de ouder
       minder ruimte, dan liep de inhoud gewoon buiten het vak door — en omdat
       daar niets geknipt wordt, tekende de onderkant van de grafiek (de dagbalk
       en de datumscheiding) over de weekstrip eronder. Gemeten: 361px inhoud in
       een vak van 314px, dus 47px eroverheen: precies de dagnamen, datums en
       icoontjes die onzichtbaar waren. */
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", backgroundColor: CREAM, padding: compact ? "4px 0 0 0" : "12px 0 0 0" }}>

      {compact ? (
        /* ── Compacte header: titel + legenda op één regel ── */
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 10, paddingRight: 10, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: LINE, flexShrink: 0 }}>
            WIND{hasKnmi ? <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 4 }}>KNMI</span> : null}
          </span>
          <div style={{ display: "flex", gap: 10, fontSize: 9, color: DARK, flexWrap: "wrap" }}>
            <LegItem color={LINE}     line="solid"  label="Measured" />
            <LegItem color={GUST}     line="dashed" label="Gust" />
            <LegItem color={FORECAST} line="dotted" label="Forecast" />
            <LegItem color={ORANGE}   line="dashed" label="Now" />
          </div>
        </div>
      ) : (
        <>
          {/* Titel + bron */}
          <div style={{ textAlign: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: LINE }}>Live WIND</span>
            {hasKnmi && (
              <span style={{ fontSize: 10, color: LINE, opacity: 0.65, marginLeft: 8 }}>
                (past: KNMI st.330)
              </span>
            )}
          </div>
          {liveAt && (
            <div style={{ textAlign: "center", fontSize: 9, color: LINE, marginBottom: 4 }}>
              updated at: {liveAt.slice(11, 16)}
            </div>
          )}

          {/* Legenda */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 10, color: DARK, marginBottom: 6 }}>
            <LegItem color={LINE}      line="solid"  label="Measured wind" />
            <LegItem color={GUST}      line="dashed" label="Gust" />
            <LegItem color={FORECAST}  line="dotted" label="Forecast" />
            <LegItem color={ORANGE}    line="dashed" label="Now" />
          </div>
        </>
      )}

      <WindDirectionBadge windDir={windDir} shoreAngle={shoreAngle} />

      {/* Scrollbare grafiek met vaste Y-as */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

      {/* Vaste Y-as links — handmatige SVG, exact uitgelijnd met hoofdgrafiek */}
      <div style={{ flexShrink: 0, backgroundColor: CREAM, zIndex: 2 }}>
        <svg width={yAxisPanelW} height={chartH} style={{ display: "block" }}>
          {/* As-lijn rechts */}
          <line x1={yAxisPanelW} y1={plotTop} x2={yAxisPanelW} y2={plotBottom + 1} stroke={LINE} strokeWidth={1} />
          {yTicks.map((v) => {
            const y = yOf(v);
            const isBottom = v === 0;
            const fs = compact ? 9 : 11;
            return (
              <text
                key={v}
                x={yAxisPanelW / 2}
                y={isBottom ? y - 2 : y}
                dy={isBottom ? 0 : "0.355em"}
                textAnchor="middle"
                fontSize={fs}
                fill={LINE}
              >
                {v} {unit}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Scrollbaar deel zonder Y-as */}
      <div
        ref={scrollRef}
        className="hide-scrollbar"
        style={{
          flex: 1, minHeight: 0, overflowX: "auto", overflowY: "hidden",
          scrollbarWidth: "none", msOverflowStyle: "none",
          paddingRight: 16, cursor: "grab",
          WebkitOverflowScrolling: "touch",
          userSelect: "none", WebkitUserSelect: "none",
        }}
        onMouseEnter={() => {
          if (windowWheelRef.current) window.removeEventListener("wheel", windowWheelRef.current);
          windowWheelRef.current = (e) => {
            e.preventDefault();
            if (scrollRef.current) scrollRef.current.scrollLeft += e.deltaY || e.deltaX;
          };
          window.addEventListener("wheel", windowWheelRef.current, { passive: false });
        }}
        onMouseLeave={() => {
          if (windowWheelRef.current) {
            window.removeEventListener("wheel", windowWheelRef.current);
            windowWheelRef.current = null;
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget; const startX = e.pageX + el.scrollLeft;
          el.style.cursor = "grabbing";
          const mv = (ev) => { el.scrollLeft = startX - ev.pageX; };
          const up = () => { el.style.cursor = "grab"; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
          window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
        }}
        onTouchStart={(e) => {
          const el = e.currentTarget;
          el._touchStartX = e.touches[0].pageX + el.scrollLeft;
        }}
        onTouchMove={(e) => {
          const el = e.currentTarget;
          if (el._touchStartX !== undefined) {
            el.scrollLeft = el._touchStartX - e.touches[0].pageX;
          }
        }}
        onTouchEnd={(e) => {
          delete e.currentTarget._touchStartX;
        }}
      >
        <div style={{ width: chartW, position: "relative" }}>
          <ComposedChart width={chartW} height={chartH} data={data} margin={{ top: 16, right: 24, bottom: 20, left: 4 }}>
            <defs>
              <linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={LINE} stopOpacity={0.45} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke={LINE} strokeOpacity={0.2} vertical={false} />
            <XAxis
              dataKey="_idx" type="number"
              domain={[0, data.length - 1]}
              ticks={data.map((_, i) => i)}
              tick={<XTick />}
              axisLine={{ stroke: LINE }} tickLine={{ stroke: LINE }}
              interval={0} height={36}
            />
            <YAxis domain={yDomain} hide />

            {/* Referentielijnen — alleen tonen binnen huidig Y-bereik */}
            {visibleRefs.map((r) => (
              <ReferenceLine key={r.val} y={r.val} stroke={LINE} strokeDasharray="4 4" strokeOpacity={0.5}
                label={{ value: r.label, position: "insideRight", fontSize: 10, fill: LINE }} />
            ))}
            {/* Dag-overgangen: alleen verticale lijn */}
            {dayChanges.map((row) => (
              <ReferenceLine key={row.date} x={row._idx}
                stroke={DARK} strokeDasharray="3 3" strokeOpacity={0.3}
              />
            ))}

            <Tooltip
              cursor={{ stroke: DARK, strokeWidth: 1, strokeOpacity: 0.35, strokeDasharray: "4 2" }}
              content={<WindTooltip unit={unit} lineColor={LINE} bgColor={CREAM} />}
            />

            {/* Windstoot: amber stippellijn */}
            <Line
              type="linear" dataKey="stoot" name="Gust"
              stroke={GUST} strokeDasharray="4 2" strokeWidth={1.5}
              dot={GustDot} activeDot={{ r: 4, fill: GUST }}
              connectNulls isAnimationActive={false}
            />

            {/* Gemeten wind (verleden + nu): blauwe area */}
            <Area
              type="linear" dataKey="verleden" name="Measured"
              stroke={LINE} strokeWidth={2.5} fill="url(#windFill)"
              dot={VerledenDot} activeDot={false}
              connectNulls isAnimationActive={false}
            />

            {/* Voorspelling: LICHTBLAUWE stippellijn */}
            <Line
              type="linear" dataKey="verwacht" name="Forecast"
              stroke={FORECAST} strokeDasharray="5 4" strokeWidth={2.5}
              dot={VerwachtDot} activeDot={false}
              connectNulls isAnimationActive={false}
            />
          </ComposedChart>

          {/* Dag-strip onder de grafiek */}
          <svg width={chartW} height={36} style={{ display: "block", marginTop: -16 }}>
            {dayBands.map((band) => {
              const mx = (band.x1 + band.x2) / 2;
              const y  = 16;
              return (
                <g key={band.date}>
                  {band.hasLeft  && <line x1={band.x1} y1={4} x2={band.x1} y2={28} stroke={LINE} strokeWidth={1.5} />}
                  {band.hasRight && <line x1={band.x2} y1={4} x2={band.x2} y2={28} stroke={LINE} strokeWidth={1.5} />}
                  <line x1={band.x1 + (band.hasLeft ? 4 : 0)} y1={y} x2={mx - 62} y2={y} stroke={LINE} strokeOpacity={0.5} strokeWidth={1} />
                  <line x1={mx + 62} y1={y} x2={band.x2 - (band.hasRight ? 4 : 0)} y2={y} stroke={LINE} strokeOpacity={0.5} strokeWidth={1} />
                  <text x={mx} y={y + 6} textAnchor="middle" fontSize={16} fontWeight={700} fill={LINE}>
                    {fmtDayLong(band.date)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      </div>{/* einde flex-wrapper Y-as + scroll */}

      {!compact && (
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 10, color: LINE, fontStyle: "italic",
          paddingLeft: 4, paddingRight: 36, marginTop: 2,
        }}>
          <span>← Measured</span>
          {fcstT && <span style={{ color: FORECAST }}>Forecast →</span>}
        </div>
      )}
    </div>
  );
}

function toCompass(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return `${dirs[Math.round(deg / 22.5) % 16]} ${Math.round(deg)}°`;
}

function WindTooltip({ active, payload, unit, lineColor, bgColor }) {
  if (!active || !payload?.length) return null;

  const row      = payload[0]?.payload;
  const measured = row?._measured ?? true;
  const dir      = row?._dir ?? null;

  const items = payload.filter((p) => {
    if (p.value == null) return false;
    if (p.dataKey === "verleden" && !measured) return false;
    if (p.dataKey === "verwacht" &&  measured) return false;
    return true;
  });
  if (!items.length) return null;

  // Datum + tijd als header zodat de gebruiker ziet welk specifiek uur actief is
  const dateLabel = row?.date
    ? new Date(row.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const timeLabel = row?.t ?? "";

  return (
    <div style={{ fontSize: 11, border: `1px solid ${lineColor}`, background: bgColor, padding: "6px 10px", borderRadius: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{dateLabel} {timeLabel}</div>
      {items.map((p) => {
        const name = p.dataKey === "stoot"
          ? (measured ? "Gust (meas.)" : "Gust (fcst)")
          : p.name;
        return <div key={p.dataKey}>{name}: {Number(p.value).toFixed(1)} {unit}</div>;
      })}
      {dir != null && (
        <div style={{ marginTop: 4, color: ARROW }}>Direction: {toCompass(dir)}</div>
      )}
    </div>
  );
}

function LegItem({ color, line, dot, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {dot ? (
        <svg width={12} height={12}><circle cx={6} cy={6} r={5} fill={color} /></svg>
      ) : (
        <svg width={22} height={8}>
          <line x1={0} y1={4} x2={22} y2={4} stroke={color} strokeWidth={2}
            strokeDasharray={line === "dashed" ? "4 2" : line === "dotted" ? "5 4" : "none"} />
        </svg>
      )}
      <span style={{ color }}>{label}</span>
    </div>
  );
}

function fmtDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function fmtDayLong(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function cvt(ms, unit) {
  if (ms == null) return undefined;
  return parseFloat(convertWind(ms, unit).toFixed(2));
}
