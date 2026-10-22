import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from "recharts";
import { convertWind } from "./SpotInfo.jsx";
import { useTheme } from "../theme.js";
import { fmtUpdatedAt } from "../time.js";
import { useVenster, zetVenster, msVan, useNuTeller } from "../tijdvenster.js";
import { t as vertaal, locale } from "../taal.js";
import WindDirectionBadge from "./WindDirectionBadge.jsx";

const FORECAST = "#60b8e8";
const ARROW    = "#3d7fa8";

const PX_PER_HOUR = 72;
// Telefoon: meer uren in beeld, anders tonen de golfgrafieken eronder (drie-
// uurlijkse data) in hetzelfde venster maar twee punten.
const PX_PER_HOUR_COMPACT = 40;

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
function ArrowDot({ cx, cy, windDir = 90, compact = false }) {
  if (cx == null || cy == null) return null;
  // Wandscherm: groot genoeg om vanaf de bank de richting te lezen.
  const s = compact ? 9 : 13;
  const sw = compact ? 2 : 2.75;
  return (
    <g transform={`translate(${cx},${cy}) rotate(${windDir + 90})`}>
      <line x1={-s} y1="0" x2={s - 2} y2="0" stroke={ARROW} strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${s-5},-${(s*.55).toFixed(1)} L${s+1},0 L${s-5},${(s*.55).toFixed(1)}`}
        stroke={ARROW} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function OrangeDot({ cx, cy, orange, cream }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={7} fill={orange} stroke={cream} strokeWidth={2.5} />;
}

// onlyMeasured: toon pijlen alleen voor origineel gemeten punten (past/live), niet voor verstreken forecast
function makeDot({ data, dataKey, liveIdx, windDir, unit, compact, dark, orange, cream, onlyMeasured = false }) {
  const fs  = compact ? 10 : 16;
  const yUp = compact ? -14 : -20;
  const yDn = compact ?  18 :  27;
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
        <ArrowDot cx={cx} cy={cy} windDir={data[index]?._dir ?? windDir} compact={compact} />
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
  const fs  = compact ? 10 : 16;
  const yUp = compact ? -6 : -9;
  const yDn = compact ? 14 : 20;
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
export default function WindChart({ past, live, forecast, unit = "kts", windDir = 90, compact = false, liveAt = null, shoreAngle = null, utcOffset = 0, scrollToDate = null, onSelect = null }) {
  const theme = useTheme();
  const LINE   = theme.border;
  const CREAM  = theme.cream;
  const DARK   = theme.dark;
  const ORANGE = theme.orange;
  const GUST   = theme.gust;

  const scrollRef = useRef(null);
  // Zichtbaar deel van de scrollgrafiek: de datum onder de grafiek blijft daarbinnen.
  const [zicht, setZicht] = useState({ l: 0, r: 0 });
  const meetZicht = useCallback(() => {
    const el = scrollRef.current;
    if (el) setZicht({ l: el.scrollLeft, r: el.scrollLeft + el.clientWidth });
  }, []);
  const windowWheelRef = useRef(null);

  // Ruim window-listener op bij unmount (voor het geval muis nog boven grafiek zweeft)
  useEffect(() => () => {
    if (windowWheelRef.current) window.removeEventListener("wheel", windowWheelRef.current);
  }, []);
  const [chartH, setChartH] = useState(260);
  const resizeObsRef = useRef(null);

  /* De scroll-container wordt via een callback-ref opgemeten, niet via een
     effect met lege deps.

     Waarom dat verschil telt: bij de eerste render is er nog geen winddata en
     rendert deze component alleen "No wind data" — de scroll-container bestaat
     dan niet. Een effect dat één keer draait vond `scrollRef.current === null`,
     stopte, en draaide daarna nooit meer, ook niet toen de data binnenkwam en
     de container er wél was. Daardoor bleef `chartH` op de beginwaarde 260
     staan, ook als er maar 244px beschikbaar was. Die 16px overschot plus de
     36px dagbalk liepen buiten het vak: eerst over de weekstrip heen, en nadat
     die container ging knippen waren de uren en de dagbalk onder de grafiek
     domweg weg.

     Een callback-ref draait wél opnieuw zodra het element verschijnt of
     verdwijnt, en meet dus altijd het echte vak op. */
  const koppelScrollContainer = useCallback((node) => {
    if (resizeObsRef.current) {
      resizeObsRef.current.disconnect();
      resizeObsRef.current = null;
    }
    scrollRef.current = node;
    if (!node) return;

    const meet = (h) => {
      // Compact: geen footer, alleen dag-strip (36px SVG, overlapt 16px → netto 20px).
      // Normaal: footer (~20px) + dag-strip (20px netto) = 40px aftrek.
      const overhead = compact ? 20 : 40;
      if (h > 40) setChartH(Math.max(80, h - overhead));
    };

    meet(node.getBoundingClientRect().height);
    const ro = new ResizeObserver(([entry]) => meet(entry.contentRect.height));
    ro.observe(node);
    resizeObsRef.current = ro;
  }, [compact]);

  useEffect(() => () => resizeObsRef.current?.disconnect(), []);

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
  const chartW   = Math.max(compact ? 400 : 800, totalPts * (compact ? PX_PER_HOUR_COMPACT : PX_PER_HOUR));

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
      meetZicht();
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
    meetZicht();
  }, [noonIdx, chartW, totalPts]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Gedeeld tijdvenster ─────────────────────────────────────────────────
  // De x-as loopt per datapunt, niet per tijd (het nu-punt valt tussen twee
  // hele uren), dus omrekenen via de tijden van de punten zelf.
  const rijMs = useMemo(() => allRows.map((r) => msVan(r.date, r.t)), [allRows]);
  const plotW = chartW - LEFT_OFFSET - RIGHT_OFFSET;
  const pxNaarMs = useCallback((x) => {
    if (rijMs.length < 2) return NaN;
    const idx = Math.max(0, Math.min(rijMs.length - 1, ((x - LEFT_OFFSET) / plotW) * (rijMs.length - 1)));
    const i = Math.min(Math.floor(idx), rijMs.length - 2);
    return rijMs[i] + (idx - i) * (rijMs[i + 1] - rijMs[i]);
  }, [rijMs, plotW]);
  const msNaarPx = useCallback((ms) => {
    if (rijMs.length < 2) return 0;
    let i = 0;
    while (i < rijMs.length - 2 && rijMs[i + 1] <= ms) i++;
    const frac = Math.max(0, Math.min(1, (ms - rijMs[i]) / (rijMs[i + 1] - rijMs[i])));
    return LEFT_OFFSET + ((i + frac) / (rijMs.length - 1)) * plotW;
  }, [rijMs, plotW]);

  useEffect(() => {
    if (zicht.r > zicht.l) zetVenster(pxNaarMs(zicht.l), pxNaarMs(zicht.r), "wind");
  }, [zicht, pxNaarMs]);

  const venster = useVenster();
  const nuTeller = useNuTeller();
  useEffect(() => {
    const el = scrollRef.current;
    if (!nuTeller || !el || nowIdx < 0) return;
    el.scrollLeft = msNaarPx(rijMs[nowIdx]) - el.clientWidth / 2;
    meetZicht();
  }, [nuTeller]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scrollRef.current;
    if (!venster || venster.bron === "wind" || !el) return;
    el.scrollLeft = msNaarPx(venster.start);
  }, [venster, msNaarPx]);

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
    // Telefoon: 40px per uur, dan past alleen elk tweede hele uur leesbaar.
    const t = row?.t ?? "";
    const verberg = compact && t.endsWith(":00") && parseInt(t, 10) % 2 === 1;
    return (
      <text x={x} y={y + (compact ? 12 : 17)} textAnchor="middle" fontSize={compact ? 11 : 15} fill={LINE}>
        {verberg ? "" : t}
      </text>
    );
  }, [data, LINE, compact]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const yAxisPanelW = compact ? 28 : 74;

  // Handmatige SVG Y-as — exacte pixel-uitlijning met hoofdgrafiek
  // Marges zijn identiek aan de ComposedChart: top=16, bottom=20, XAxis height=36
  const CHART_MARGIN_TOP  = 16;
  const CHART_MARGIN_BOT  = 20;
  const XAXIS_H           = compact ? 36 : 42;
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

  // Aangewezen punt doorgeven (voor de pijlen op de kaart); alleen bij een ander
  // punt, niet bij elke muisbeweging. Het nu-punt of niets = live tonen.
  const gekozenRef = useRef(null);
  const kies = useCallback((i) => {
    const idx = i == null ? null : Number(i);
    if (idx === gekozenRef.current) return;
    gekozenRef.current = idx;
    onSelect?.(idx == null || idx === nowIdx ? null : allRows[idx] ?? null);
  }, [onSelect, nowIdx, allRows]);
  useEffect(() => () => onSelect?.(null), [onSelect]);

  // Alleen "Measured" noemen wat echt gemeten is; anders eerlijk "Past (model)".
  const BRONNAAM = { knmi: "KNMI", weather2kite: "Weather2Kite", buienradar: "Buienradar" };
  const meetbron = BRONNAAM[["knmi", "weather2kite", "buienradar"].find((b) => allRows.some((r) => r.src === b))] ?? null;
  const verledenLabel = vertaal(meetbron ? "Measured" : "Past (model)");

  if (!allRows.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: LINE, fontSize: 13 }}>
        {vertaal("No wind data")}
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
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", padding: compact ? "4px 0 0 0" : "12px 0 0 0" }}>

      {compact ? (
        /* ── Compacte header: titel + legenda op één regel ── */
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 10, paddingRight: 10, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: LINE, flexShrink: 0 }}>
            WIND{meetbron ? <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 4 }}>{meetbron}</span> : null}
          </span>
          <div style={{ display: "flex", gap: 10, fontSize: 9, color: DARK, flexWrap: "wrap" }}>
            <LegItem color={LINE}     line="solid"  label={verledenLabel} />
            <LegItem color={GUST}     line="dashed" label={vertaal("Gust")} />
            <LegItem color={FORECAST} line="dotted" label={vertaal("Forecast")} />
            <LegItem color={ORANGE} dot label={vertaal("Now")} />
          </div>
        </div>
      ) : (
        <>
          {/* Titel + bron */}
          <div style={{ textAlign: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.08em", color: LINE }}>{vertaal("Live WIND")}</span>
            {meetbron && (
              <span style={{ fontSize: 13, color: LINE, opacity: 0.65, marginLeft: 8 }}>
                ({vertaal("past:")} {meetbron})
              </span>
            )}
          </div>
          {liveAt && (
            <div style={{ textAlign: "center", fontSize: 12, color: LINE, marginBottom: 4 }}>
              {vertaal("updated at:")} {fmtUpdatedAt(liveAt, utcOffset)}
            </div>
          )}

          {/* Legenda */}
          <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 13, color: DARK, marginBottom: 6 }}>
            <LegItem color={LINE}      line="solid"  label={vertaal(meetbron ? "Measured wind" : "Past (model)")} />
            <LegItem color={GUST}      line="dashed" label={vertaal("Gust")} />
            <LegItem color={FORECAST}  line="dotted" label={vertaal("Forecast")} />
            <LegItem color={ORANGE} dot label={vertaal("Now")} />
          </div>
        </>
      )}

      {/* Op de telefoon staat dit al bij DIRECTION in de infostrip boven de
          grafiek (22-10, op verzoek) — hier nog eens tonen was dubbelop en
          duwde de grafiek onnodig naar beneden. */}
      {!compact && <WindDirectionBadge windDir={windDir} shoreAngle={shoreAngle} />}

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
            const fs = compact ? 9 : 18;
            return (
              <text
                key={v}
                x={yAxisPanelW / 2}
                y={isBottom ? y - 2 : y}
                dy={isBottom ? 0 : "0.355em"}
                textAnchor="middle"
                fontSize={fs}
                fontWeight={compact ? 400 : 600}
                fill={compact ? LINE : DARK}
              >
                {v} {unit}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Scrollbaar deel zonder Y-as */}
      <div
        ref={koppelScrollContainer}
        onScroll={meetZicht}
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
          <ComposedChart width={chartW} height={chartH} data={data} margin={{ top: 16, right: 24, bottom: 20, left: 4 }}
            onMouseMove={(st) => kies(st?.activeTooltipIndex)} onMouseLeave={() => kies(null)}>
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
              interval={0} height={XAXIS_H}
            />
            <YAxis domain={yDomain} hide />

            {/* Referentielijnen — alleen tonen binnen huidig Y-bereik */}
            {visibleRefs.map((r) => (
              <ReferenceLine key={r.val} y={r.val} stroke={LINE} strokeDasharray="4 4" strokeOpacity={0.5}
                label={{ value: r.label, position: "insideRight", fontSize: compact ? 10 : 13, fill: LINE }} />
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

          {/* Dag-strip onder de grafiek. Het label staat in het midden van het
              zichtbare deel van de dag, niet van de hele dag: anders viel het
              bij een lange dag buiten beeld en bleef er een lege band over. */}
          <svg width={chartW} height={36} style={{ display: "block", marginTop: -16 }}>
            {dayBands.map((band) => {
              const half = compact ? 62 : 100;
              const vl = Math.max(band.x1, zicht.l), vr = zicht.r > 0 ? Math.min(band.x2, zicht.r) : band.x2;
              const mx = vr - vl >= 2 * half
                ? (vl + vr) / 2
                : (band.x1 + band.x2) / 2;
              const y  = 16;
              return (
                <g key={band.date}>
                  {band.hasLeft  && <line x1={band.x1} y1={4} x2={band.x1} y2={28} stroke={LINE} strokeWidth={1.5} />}
                  {band.hasRight && <line x1={band.x2} y1={4} x2={band.x2} y2={28} stroke={LINE} strokeWidth={1.5} />}
                  <line x1={band.x1 + (band.hasLeft ? 4 : 0)} y1={y} x2={mx - half} y2={y} stroke={LINE} strokeOpacity={0.5} strokeWidth={1} />
                  <line x1={mx + half} y1={y} x2={band.x2 - (band.hasRight ? 4 : 0)} y2={y} stroke={LINE} strokeOpacity={0.5} strokeWidth={1} />
                  <text x={mx} y={y + 8} textAnchor="middle" fontSize={compact ? 16 : 24} fontWeight={700} fill={compact ? LINE : DARK}>
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
          fontSize: 13, color: LINE, fontStyle: "italic",
          paddingLeft: 4, paddingRight: 36, marginTop: 2,
        }}>
          <span>← {verledenLabel}</span>
          {fcstT && <span style={{ color: FORECAST }}>{vertaal("Forecast")} →</span>}
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
    ? fmtDay(row.date)
    : "";
  const timeLabel = row?.t ?? "";

  return (
    <div style={{ fontSize: 11, border: `1px solid ${lineColor}`, background: bgColor, padding: "6px 10px", borderRadius: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{dateLabel} {timeLabel}</div>
      {items.map((p) => {
        const name = p.dataKey === "stoot"
          ? vertaal(measured ? "Gust (meas.)" : "Gust (fcst)")
          : vertaal(p.name);
        return <div key={p.dataKey}>{name}: {Number(p.value).toFixed(1)} {unit}</div>;
      })}
      {dir != null && (
        <div style={{ marginTop: 4, color: ARROW }}>{vertaal("Direction:")} {toCompass(dir)}</div>
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
  return hoofdletter(d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }));
}

function fmtDayLong(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return hoofdletter(d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" }));
}

const hoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function cvt(ms, unit) {
  if (ms == null) return undefined;
  return parseFloat(convertWind(ms, unit).toFixed(2));
}
