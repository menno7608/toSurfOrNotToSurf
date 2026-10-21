import { useMemo, useState, useEffect, useRef } from "react";
import { convertWind } from "./SpotInfo.jsx";
import MiniChart from "./MiniChart.jsx";
import { useTheme } from "../theme.js";
import { useVenster } from "../tijdvenster.js";
import { t as vertaal, locale } from "../taal.js";

const MODELS = [
  { id: "best_match",                 label: "Best Match (auto)" },
  { id: "ecmwf_ifs025",               label: "ECMWF IFS" },
  { id: "gfs_seamless",               label: "GFS (NOAA)" },
  { id: "icon_seamless",              label: "ICON (DWD)" },
  { id: "knmi_harmonie_arome_europe", label: "Harmonie (KNMI)" },
  { id: "meteofrance_seamless",       label: "Météo-France" },
];

// Rechts altijd 10px zodat alle secties rechts uitlijnen.
// Links 5px zodat grafieken dicht bij de linker rand zitten.
const PX  = "5px 10px 5px 5px";   // top right bottom left
const PXi = "5px 10px";           // info-secties: links/rechts gelijk voor visuele rust

function filterMarine(marine, nowMs) {
  if (!marine?.length || nowMs == null) return [];
  const lo = nowMs -  36 * 60 * 60 * 1000;  // zelfde terugblik als de windgrafiek (gekoppeld tijdvenster)
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
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

function cleanScore(hs, swh) {
  if (hs == null || hs === 0 || swh == null) return null;
  const pct = Math.round((swh / hs) * 100);
  if (pct >= 75) return { pct, color: "#27ae60" };
  if (pct >= 50) return { pct, color: "#2980b9" };
  if (pct >= 25) return { pct, color: "#e07b3a" };
  return { pct, color: "#c0392b" };
}

function swellShoreType(swdir, shoreAngle) {
  if (swdir == null || shoreAngle == null) return null;
  const diff = Math.abs(((swdir - shoreAngle + 180) % 360 + 360) % 360 - 180);
  if (diff <= 45)  return { label: "ONSHORE",  color: "#27ae60" };
  if (diff <= 90)  return { label: "ANGLED",   color: "#2980b9" };
  if (diff <= 135) return { label: "SIDE",     color: "#e07b3a" };
  return               { label: "OFFSHORE", color: "#c0392b" };
}

function waveQuality(period) {
  if (period == null) return null;
  if (period >= 14) return { label: "GROUNDSWELL", color: "#27ae60" };
  if (period >= 10) return { label: "SWELL",       color: "#2980b9" };
  if (period >= 6)  return { label: "WINDSWELL",   color: "#e07b3a" };
  return                   { label: "CHOP",         color: "#c0392b" };
}

function compass(deg) {
  if (deg == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function currentStrength(kts) {
  if (kts == null) return null;
  if (kts < 0.5)  return { label: "WEAK",     color: "#27ae60" };
  if (kts < 1.5)  return { label: "MODERATE", color: "#60b8e8" };
  return                  { label: "STRONG",   color: "#fb923c" };
}

function currentTideType(currentDir, shoreAngle) {
  if (currentDir == null || shoreAngle == null) return null;
  const diff = Math.abs(((currentDir - shoreAngle + 180) % 360 + 360) % 360 - 180);
  if (diff <= 60)  return { label: "FLOOD", color: "#27ae60" };
  if (diff >= 120) return { label: "EBB",   color: "#e07b3a" };
  return                  { label: "CROSS", color: "#2980b9" };
}

export const CURRENT_BANDS = [
  { y1: 0,   y2: 0.5, fill: "#27ae60", fillOpacity: 0.07 },
  { y1: 0.5, y2: 1.5, fill: "#2980b9", fillOpacity: 0.07 },
  { y1: 1.5, y2: 5.0, fill: "#e07b3a", fillOpacity: 0.07 },
];

function BreakingWaveIcon({ active }) {
  const sw = active ? 2.2 : 1.2;
  const op = active ? 1   : 0.38;
  return (
    <svg width="14" height="8" viewBox="0 0 28 16" fill="none" style={{ flexShrink: 0, display: "block" }}>
      <circle cx="5" cy="5" r="4.8" stroke="#7a9db0" strokeWidth={sw * 0.8} opacity={op} />
      <path d="M11 15 C15 15 18 2 22 4 C25 5 25 11 22 12 C21 12 20 12 19 12"
        stroke="#7a9db0" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity={op} />
      <path d="M22 5 C24 7 24 10 22 12"
        stroke="#7a9db0" strokeWidth={sw * 0.85} strokeLinecap="round" opacity={op} />
    </svg>
  );
}

const M_TO_FT = 3.28084;
function fmtWave(m, waveUnit) {
  if (m == null) return "—";
  if (waveUnit === "ft") return `${(m * M_TO_FT).toFixed(1)}ft`;
  return `${Number(m).toFixed(1)}m`;
}


export default function SpotSidebar({ spot, unit = "kts", waveUnit = "m", onWaveUnitToggle, weatherModel, onModelChange, spotModels = {}, onSaveSpotModel, onOnderHoogte }) {
  const C = useTheme();

  // Hoogte van SPOT INFO + WEATHER MODEL. De weekstrip rechts neemt die over,
  // zodat de bovenranden van beide onderste vensters op één lijn liggen.
  const onderRef = useRef(null);
  useEffect(() => {
    const el = onderRef.current;
    if (!el || !onOnderHoogte) return undefined;
    const ro = new ResizeObserver(() => onOnderHoogte(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onOnderHoogte]);
  const l = spot?.live ?? {};

  // Clock die elke minuut tikt zodat marinevenster en "nu"-markering actueel blijven
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMs = useMemo(
    () => Date.now() + (spot?.utcOffset ?? 0) * 1000,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, spot?.utcOffset]
  );

  const marine     = useMemo(() => filterMarine(spot?.marine, nowMs), [spot?.marine, nowMs]);
  const marineNowT = useMemo(() => nowKey(marine, nowMs), [marine, nowMs]);

  // "Nu" = het marinepunt dichtst bij de klok; marine[0] ligt sinds de 36 uur terugblik in het verleden.
  const cm  = marine.find((p) => p._key === marineNowT) ?? marine[0] ?? null;
  const hs  = cm?.hs  ?? l.waveHeight;
  const tp  = cm?.tp  ?? l.wavePeriod;
  const swh = cm?.swh ?? null;
  const swp = cm?.swp ?? null;
  const swdir  = cm?.swdir ?? null;
  const energy = cm?.energy ?? l.waveEnergy;
  const wwh    = cm?.wwh ?? null;
  const wwp    = cm?.wwp ?? null;

  const quality    = waveQuality(swp ?? tp);
  const clean      = cleanScore(hs, swh);
  const swellShore = swellShoreType(swdir, spot?.shore_angle);
  // Datums onder de grafieken volgen het gedeelde tijdvenster, niet de hele reeks.
  const venster    = useVenster();
  const startDate  = venster ? new Date(venster.start).toISOString().slice(0, 10) : marine[0]?.date;
  const endDate    = venster ? new Date(venster.eind).toISOString().slice(0, 10) : marine[marine.length - 1]?.date;

  const hasWavesPanel = clean != null || quality != null || swh != null || wwh != null || tp != null;
  const hasSwellPanel = swdir != null;

  const liveCurrent  = l.currentSpeed;
  const liveCurrDir  = l.currentDirection;
  const currStr      = currentStrength(liveCurrent);
  const tideType     = currentTideType(liveCurrDir, spot?.shore_angle);
  const currentData  = useMemo(
    () => marine.filter((p) => p.currentSpeed != null).map((p) => ({ ...p, v: p.currentSpeed })),
    [marine]
  );
  const hasCurrentPanel = spot?.shore_angle != null && currentData.length > 0;

  return (
    <div style={{
      width: "clamp(230px, 24vw, 360px)",
      boxSizing: "border-box",
      borderRight: `2px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>

      {/* ── WAVES ── */}
      <section style={{
        padding: PX,
        borderBottom: `1px solid ${C.border}`,
        flex: 3, minHeight: 0,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header: label + toggle | huidige hoogte */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexShrink: 0 }}>
          <button onClick={onWaveUnitToggle} style={{
              marginRight: "auto",
              fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.border, cursor: "pointer", letterSpacing: "0.05em", lineHeight: 1.4,
            }}>
              {waveUnit === "m" ? "m·ft" : "ft·m"}
          </button>
          <SectionLabel>WAVES</SectionLabel>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{fmtWave(hs, waveUnit)}</span>
        </div>

        {/* Grafiek vult volledige breedte; data als rechts-uitgelijnde overlay */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <MiniChart
            data={marine.map((p) => ({
              t: p.t, _key: p._key,
              v:  waveUnit === "ft" && p.hs  != null ? p.hs  * M_TO_FT : p.hs,
              v2: waveUnit === "ft" && p.swh != null ? p.swh * M_TO_FT : p.swh ?? undefined,
            }))}
            unit={waveUnit}
            yTicks={waveUnit === "ft" ? [0, 3, 6, 10] : [0, 1, 2, 3]}
            height="100%"
            v2AsArea
            xKey="_key"
            nowT={marineNowT}
            scrollable
          />
          {hasWavesPanel && (
            <div style={{
              position: "absolute", top: 4, right: 0, bottom: 14,
              display: "flex", flexDirection: "column",
              justifyContent: "flex-start", alignItems: "flex-end",
              gap: 2, pointerEvents: "none",
              paddingLeft: 20,
              backgroundImage: `linear-gradient(to right, transparent, ${C.cream} 38%)`,
            }}>
              {clean && (
                <span style={{ fontSize: 8, fontWeight: 700, color: clean.color }}>
                  {vertaal("CLEAN")} {clean.pct}%
                </span>
              )}
              {quality && (
                <span style={{ fontSize: 8, fontWeight: 700, color: quality.color }}>
                  {vertaal(quality.label)}
                </span>
              )}
              {swh != null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginTop: 4, whiteSpace: "nowrap" }}>
                  {fmtWave(swh, waveUnit)}{swp != null ? ` · ${Number(swp).toFixed(0)}s` : ""}
                </span>
              )}
              {swdir != null && (
                <span style={{ fontSize: 9, color: C.border, whiteSpace: "nowrap" }}>
                  {compass(swdir)} {swdir}°
                </span>
              )}
              {swellShore && (
                <span style={{ fontSize: 8, fontWeight: 700, color: swellShore.color }}>
                  {vertaal(swellShore.label)}
                </span>
              )}
              {wwh != null && (
                <span style={{ fontSize: 9, color: C.border, marginTop: 4, whiteSpace: "nowrap" }}>
                  {fmtWave(wwh, waveUnit)}{wwp != null ? ` · ${Number(wwp).toFixed(0)}s` : ""} sea
                </span>
              )}
              {swh == null && wwh == null && tp != null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginTop: 4 }}>
                  {Number(tp).toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>

        {/* Datumbereik */}
        {startDate !== endDate && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.border, opacity: 0.5, marginTop: 2, flexShrink: 0 }}>
            <span>{fmtShortDate(startDate)}</span>
            <span>{fmtShortDate(endDate)}</span>
          </div>
        )}
      </section>

      {/* ── GOLFENERGIE (kJ) ── */}
      <section style={{
        padding: PX,
        borderBottom: `1px solid ${C.border}`,
        flex: 3, minHeight: 0,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header: label + golfenergie nu, rechts tegen de grafiekas */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 3, flexShrink: 0 }}>
          <SectionLabel>ENERGY</SectionLabel>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>
            {energy != null ? `${Number(energy).toFixed(0)} kJ` : "—"}
          </span>
        </div>

        {/* Grafiek vult volledige breedte; data als rechts-uitgelijnde overlay */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <MiniChart
            data={marine.map((p) => ({ t: p.t, _key: p._key, v: p.energy }))}
            unit="kJ"
            yTicks={[0, 200, 400]}
            height="100%"
            xKey="_key"
            nowT={marineNowT}
            scrollable
          />
          {hasSwellPanel && (
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 14,
              display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "flex-end",
              gap: 3, pointerEvents: "none",
              paddingLeft: 20,
              backgroundImage: `linear-gradient(to right, transparent, ${C.cream} 38%)`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.dark, lineHeight: 1 }}>
                {compass(swdir)}
              </span>
              <span style={{ fontSize: 9, color: C.border }}>{swdir}°</span>
              {swellShore && (
                <span style={{ fontSize: 8, fontWeight: 700, color: swellShore.color, marginTop: 1 }}>
                  {vertaal(swellShore.label)}
                </span>
              )}
              {tp != null && (
                <span style={{ fontSize: 9, color: C.border, marginTop: 2 }}>
                  TP {Number(tp).toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>

        {/* Datumbereik */}
        {startDate !== endDate && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.border, opacity: 0.5, marginTop: 2, flexShrink: 0 }}>
            <span>{fmtShortDate(startDate)}</span>
            <span>{fmtShortDate(endDate)}</span>
          </div>
        )}
      </section>

      {/* ── STROMING ── */}
      {hasCurrentPanel && (
        <section style={{
          padding: PX,
          borderBottom: `1px solid ${C.border}`,
          flex: 3, minHeight: 0,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 3, flexShrink: 0 }}>
            <SectionLabel>CURRENT</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: currStr?.color ?? C.dark }}>
                {liveCurrent != null ? `${liveCurrent.toFixed(1)} kts` : "—"}
              </span>
              {currStr && (
                <span style={{
                  fontSize: 7.5, fontWeight: 700, letterSpacing: "0.04em",
                  color: currStr.color, border: `1px solid ${currStr.color}`,
                  borderRadius: 2, padding: "1px 3px", lineHeight: 1.5,
                }}>
                  {vertaal(currStr.label)}
                </span>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <MiniChart
              data={currentData}
              unit="kts"
              yTicks={[0, 0.5, 1, 1.5, 2]}
              lineColor={currStr?.color ?? C.border}
              height="100%"
              bands={CURRENT_BANDS}
              xKey="_key"
              nowT={marineNowT}
              scrollable
            />
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 14,
              display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "flex-end",
              gap: 3, pointerEvents: "none",
              paddingLeft: 20,
              backgroundImage: `linear-gradient(to right, transparent, ${C.cream} 38%)`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.dark, lineHeight: 1 }}>
                {compass(liveCurrDir)}
              </span>
              {liveCurrDir != null && (
                <span style={{ fontSize: 9, color: C.border }}>{liveCurrDir}°</span>
              )}
              {tideType && (
                <span style={{ fontSize: 8, fontWeight: 700, color: tideType.color, marginTop: 1 }}>
                  {vertaal(tideType.label)}
                </span>
              )}
            </div>
          </div>

          {startDate !== endDate && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.border, opacity: 0.5, marginTop: 2, flexShrink: 0 }}>
              <span>{fmtShortDate(startDate)}</span>
              <span>{fmtShortDate(endDate)}</span>
            </div>
          )}
        </section>
      )}

      {/* Eigen 2px-bovenrand, 1px omhoog over de onderrand van het venster erboven:
          één lijn, even dik als die boven de weekstrip, zodat ze strak doorlopen. */}
      <div ref={onderRef} style={{ flexShrink: 0, borderTop: `2px solid ${C.border}`, marginTop: -1 }}>
      {/* ── SPOT INFO — compact 2-koloms grid ── */}
      <section style={{ padding: PXi, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {/* Naam op dezelfde regel als het label */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <SectionLabel>SPOT INFO</SectionLabel>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.dark, textAlign: "right", maxWidth: "60%", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {spot?.name ?? "—"}
            {spot?.subtitle && <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 4 }}>{spot.subtitle}</span>}
          </span>
        </div>
        {/* 2-koloms grid: 7 waarden → 4 rijen */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 3, columnGap: 6 }}>
          <InfoRow label="Wind"   value={fmtWind(l.windSpeed, unit)} />
          <InfoRow label="Direction" value={l.windDir != null ? deg(l.windDir) : "—"} />
          <InfoRow label="Gust"   value={fmtWind(l.windGust, unit)} />
          <InfoRow label="Wave"   value={fmtWave(l.waveHeight, waveUnit)} />
          <InfoRow label="Period" value={tp != null ? `${Number(tp).toFixed(1)}s` : "—"} />
          <InfoRow label="Air"    value={l.airTemp   != null ? `${l.airTemp.toFixed(1)}°C`   : "—"} />
          <InfoRow label="Water"  value={l.waterTemp != null ? `${l.waterTemp.toFixed(1)}°C` : "—"} />
          {l.currentSpeed != null && (
            <InfoRow label="Current" value={`${l.currentSpeed.toFixed(1)} kts ${compass(l.currentDirection)}`} />
          )}
        </div>
      </section>

      {/* ── WEATHER MODEL ── */}
      <section style={{ padding: PXi, flexShrink: 0 }}>
        <SectionLabel>WEATHER MODEL</SectionLabel>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <select
            value={weatherModel}
            onChange={(e) => onModelChange(e.target.value)}
            style={{
              flex: 1, minWidth: 0,
              fontSize: 11, padding: "3px 5px",
              borderRadius: 4, border: `1px solid ${C.border}`,
              background: C.cream, color: C.dark,
              cursor: "pointer", outline: "none",
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{vertaal(m.label)}</option>
            ))}
          </select>
          <button
            onClick={() => onSaveSpotModel?.(spot?.id, weatherModel)}
            title={vertaal(spotModels[spot?.id] === weatherModel ? "Remove pinned model" : "Pin as default for this spot")}
            style={{
              background: "none", border: "none",
              padding: "2px 4px", cursor: "pointer",
              flexShrink: 0, lineHeight: 0,
              opacity: spotModels[spot?.id] === weatherModel ? 1 : 0.25,
            }}
          >
            <BreakingWaveIcon active={spotModels[spot?.id] === weatherModel} />
          </button>
        </div>
      </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  const C = useTheme();
  return (
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: C.border, flexShrink: 0 }}>
      {typeof children === "string" ? vertaal(children) : children}
    </div>
  );
}

function DataLabel({ children }) {
  const C = useTheme();
  return (
    <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.08em", color: C.border, marginBottom: 1 }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  const C = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 10, lineHeight: 1.5 }}>
      <span style={{ color: C.border, flexShrink: 0, marginRight: 2 }}>{vertaal(label)}</span>
      <span style={{ fontWeight: 600, color: C.dark, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function fmtWind(ms, unit) {
  if (ms == null) return "—";
  return `${convertWind(ms, unit).toFixed(1)} ${unit}`;
}

function deg(d) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return `${dirs[Math.round(d / 22.5) % 16]} ${d}°`;
}
