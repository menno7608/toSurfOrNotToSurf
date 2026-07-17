import { useState, useRef, useCallback, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, ReferenceArea, Tooltip,
} from "recharts";
import { useTheme } from "../theme.js";

const VIEW_COUNT = 13;

function findNowStart(data, nowT, xKey) {
  if (!data?.length || !nowT) return 0;
  const idx = data.findIndex((d) => (xKey ? d[xKey] : d.t) === nowT);
  return idx >= 0 ? Math.max(0, idx - 3) : 0;
}

// bands: [{y1, y2, fill, fillOpacity}]
// v2AsArea: toon v2 als gevuld vlak (swell) boven lichte v achtergrond
// nowT: sleutelwaarde waarop oranje "now" stip + lijn getoond wordt
// scrollable: muiswiel scrolt door de tijd (toekomst zichtbaar)
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

  const [viewStart, setViewStart] = useState(
    () => scrollable ? findNowStart(data, nowT, xKey) : 0
  );

  useEffect(() => {
    if (scrollable) setViewStart(findNowStart(data, nowT, xKey));
  }, [data, nowT, xKey, scrollable]);

  const containerRef = useRef(null);

  const handleWheel = useCallback((e) => {
    if (!data?.length) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    setViewStart((s) => Math.max(0, Math.min(data.length - VIEW_COUNT, s + dir * 2)));
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !scrollable) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [scrollable, handleWheel]);

  if (!data?.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", fontSize: 11, color: LINE }}>
        No data
      </div>
    );
  }

  const isScrollable = scrollable && data.length > VIEW_COUNT;
  const visible = isScrollable ? data.slice(viewStart, viewStart + VIEW_COUNT) : data;
  const hasV2 = visible.some((d) => d.v2 != null);

  const visibleNowT = isScrollable
    ? (visible.some((d) => (xKey ? d[xKey] : d.t) === nowT) ? nowT : null)
    : nowT;

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

  const activeX = activeIndex != null
    ? (xKey ? visible[activeIndex]?.[xKey] : visible[activeIndex]?.t)
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{ height, position: "relative", cursor: isScrollable ? "ew-resize" : "default" }}
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
          <XAxis
            dataKey={xKey || "t"}
            tick={{ fontSize: 9, fill: LINE }}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={xKey ? (v) => (typeof v === "string" ? v.split("T")[1] ?? v : v) : undefined}
          />
          <YAxis
            tick={{ fontSize: 9, fill: LINE }}
            axisLine={false} tickLine={false}
            ticks={yTicks.length ? yTicks : undefined}
            tickCount={3} width={16}
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
              const key = xKey ? props.payload?.[xKey] : props.payload?.t;
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

      {/* Tijdlijn-scrollbalk: geeft aan waar je bent in de 5-daagse range */}
      {isScrollable && (
        <div style={{
          position: "absolute", bottom: 0, left: 24, right: 4,
          height: 2, background: LINE, opacity: 0.12, borderRadius: 1,
        }}>
          <div style={{
            position: "absolute", top: 0, height: "100%", borderRadius: 1,
            background: ORANGE, opacity: 0.65,
            left: `${(viewStart / Math.max(1, data.length - VIEW_COUNT)) * 100}%`,
            width: `${Math.min(100, (VIEW_COUNT / data.length) * 100)}%`,
            transition: "left 0.08s",
          }} />
        </div>
      )}
    </div>
  );
}
