import { useTheme } from "../theme.js";

const TABS = [
  { id: "wind",    label: "WIND" },
  { id: "current", label: "CURRENT" },
  { id: "waves",   label: "WAVES" },
  { id: "tide",    label: "TIDE" },
  { id: "rain",    label: "RAIN" },
];

export default function ChartTabs({ spot, active, onChange }) {
  const C = useTheme();

  const tabs = TABS.filter((t) => {
    if (t.id === "current") return spot?.shore_angle != null;
    if (t.id === "waves")   return (spot?.marine?.length ?? 0) > 0;
    if (t.id === "tide")    return (spot?.marine ?? []).some((p) => p.tide != null);
    return true;
  });

  return (
    <div style={{
      display: "flex", gap: 4, padding: "4px 8px",
      borderBottom: `1px solid ${C.border}44`,
      backgroundColor: C.cream,
      flexShrink: 0,
    }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              fontSize: 9, fontWeight: 900, letterSpacing: "0.1em",
              padding: "3px 10px", borderRadius: 3,
              border: `1.5px solid ${isActive ? C.dark : C.border}`,
              background: isActive ? C.dark : "transparent",
              color: isActive ? C.cream : C.border,
              cursor: "pointer", outline: "none",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
