import { useTheme } from "../theme.js";
import { ALL_SHORE_TYPES } from "../hooks/useAlarmRules.js";
import { useAlarmMatch } from "../hooks/useAlarmMatch.js";

const SHORE_COLOR = {
  "ON SHORE":   "#e74c3c",
  "SIDE-ON":    "#e67e22",
  "SIDE SHORE": "#27ae60",
  "SIDE-OFF":   "#e67e22",
  "OFF SHORE":  "#e74c3c",
};

const GLOW = "#60b8e8";

function Label({ children }) {
  const C = useTheme();
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.border, marginBottom: 5 }}>
      {children}
    </div>
  );
}

function RangeRow({ label, min, max, value, onChange, unit, fmt }) {
  const C = useTheme();
  const display = fmt ? fmt(value) : `${value} ${unit}`;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: C.border }}>{label}</span>
        <span style={{ color: C.dark, fontWeight: 700 }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: GLOW }}
      />
    </div>
  );
}

function ShoreCheckboxes({ selected, onChange }) {
  const C = useTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>WIND DIRECTION</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {ALL_SHORE_TYPES.map((type) => {
          const active = selected.includes(type);
          return (
            <button
              key={type}
              onClick={() => onChange(active ? selected.filter((t) => t !== type) : [...selected, type])}
              style={{
                padding: "3px 8px", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                border: `1.5px solid ${SHORE_COLOR[type]}`,
                borderRadius: 3,
                background: active ? SHORE_COLOR[type] : "transparent",
                color: active ? "#fff" : SHORE_COLOR[type],
                cursor: "pointer",
              }}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SportRules({ sport, rules, updateRule }) {
  const r = rules[sport];
  if (!r) return null;

  if (sport === "kiten") return (
    <>
      <RangeRow label="Min. wind" min={5} max={30} value={r.windMin} onChange={(v) => updateRule("kiten", "windMin", v)} unit="kts" />
      <RangeRow label="Max. wind" min={10} max={50} value={r.windMax} onChange={(v) => updateRule("kiten", "windMax", v)} unit="kts" />
      <ShoreCheckboxes selected={r.shoreTypes} onChange={(v) => updateRule("kiten", "shoreTypes", v)} />
    </>
  );

  if (sport === "windsurfen") return (
    <>
      <RangeRow label="Min. wind" min={5} max={30} value={r.windMin} onChange={(v) => updateRule("windsurfen", "windMin", v)} unit="kts" />
      <RangeRow label="Max. wind" min={10} max={60} value={r.windMax} onChange={(v) => updateRule("windsurfen", "windMax", v)} unit="kts" />
      <ShoreCheckboxes selected={r.shoreTypes} onChange={(v) => updateRule("windsurfen", "shoreTypes", v)} />
    </>
  );

  if (sport === "golfsurfen") return (
    <>
      <RangeRow
        label="Min. wave height"
        min={0} max={30}
        value={Math.round(r.waveMin * 10)}
        onChange={(v) => updateRule("golfsurfen", "waveMin", v / 10)}
        fmt={(v) => `${(v / 10).toFixed(1)} m`}
      />
      <RangeRow label="Min. period" min={4} max={20} value={r.periodMin} onChange={(v) => updateRule("golfsurfen", "periodMin", v)} unit="s" />
      <RangeRow label="Max. wind" min={5} max={30} value={r.windMax} onChange={(v) => updateRule("golfsurfen", "windMax", v)} unit="kts" />
      <ShoreCheckboxes selected={r.shoreTypes} onChange={(v) => updateRule("golfsurfen", "shoreTypes", v)} />
    </>
  );

  return null;
}

function fmtMatchTime(pt) {
  if (!pt) return null;
  const d = new Date(`${pt.date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " " + pt.t;
}

export default function AlarmPanel({ spot, rules, updateRule, spotSport, setSpotSport, onClose }) {
  const C = useTheme();
  const activeSport = spotSport[spot?.id] ?? "off";
  const { matches, hasMatch } = useAlarmMatch(spot, rules, activeSport);
  const firstMatch = matches[0] ?? null;

  const SPORTS = [
    { id: "off",        label: "OFF" },
    { id: "kiten",      label: "KITE" },
    { id: "windsurfen", label: "WIND" },
    { id: "golfsurfen", label: "SURF" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#00000055", zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.cream, border: `2px solid ${C.border}`,
          borderRadius: 8, padding: 20,
          width: 340, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.border }}>ALARM RULES</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.border, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        {/* Sport keuze voor deze spot */}
        <div style={{ marginBottom: 16 }}>
          <Label>SPORT FOR {spot?.name?.toUpperCase() ?? "—"}</Label>
          <div style={{ display: "flex", gap: 3 }}>
            {SPORTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setSpotSport(spot?.id, id)}
                style={{
                  flex: 1, padding: "6px 0",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  border: `1.5px solid ${C.border}`, borderRadius: 3,
                  background: activeSport === id ? C.border : "transparent",
                  color: activeSport === id ? C.cream : C.border,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Regelinstellingen */}
        {activeSport !== "off" && <SportRules sport={activeSport} rules={rules} updateRule={updateRule} />}

        {/* Match resultaat */}
        {activeSport !== "off" && (
          <div style={{
            marginTop: 4, padding: "10px 12px", borderRadius: 5,
            border: `1.5px solid ${hasMatch ? GLOW : C.border}`,
            background: hasMatch ? `${GLOW}22` : "transparent",
          }}>
            {hasMatch ? (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: GLOW, marginBottom: 4 }}>
                  FIRST MATCH
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{fmtMatchTime(firstMatch)}</div>
                <div style={{ fontSize: 10, color: C.border, marginTop: 2 }}>
                  {matches.length} hour{matches.length !== 1 ? "s" : ""} of good conditions found
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: C.border, marginBottom: 4 }}>
                  NO MATCH
                </div>
                <div style={{ fontSize: 11, color: C.border }}>
                  No good conditions in the next 5 days
                </div>
              </>
            )}
          </div>
        )}

        {/* Toekomstige koppeling */}
        <div style={{ marginTop: 14, fontSize: 9, color: C.border, opacity: 0.5, textAlign: "center" }}>
          Push notifications coming soon
        </div>
      </div>
    </div>
  );
}
