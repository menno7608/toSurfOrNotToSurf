import { useState } from "react";
import FeedbackFormulier from "./FeedbackFormulier.jsx";
import { t as vertaal } from "../taal.js";

const DARK = "#1a2635";
const CREAM = "#f0ebe0";

function Tandwiel({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function Instellingen({ spots = [], homeSpotId = "", onHomeSpot, onSelectSpot, color = CREAM, knopStijl = {} }) {
  const [open, setOpen] = useState(false);

  const opNaam = [...spots].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const kies = (e) => {
    const id = e.target.value;
    onHomeSpot?.(id);
    if (id) onSelectSpot?.(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={vertaal("Settings")}
        title={vertaal("Settings")}
        style={{
          padding: "3px 8px", borderRadius: 3, flexShrink: 0, lineHeight: 0,
          border: `1px solid ${color}`, background: "transparent",
          color, cursor: "pointer", display: "flex", alignItems: "center",
          ...knopStijl,
        }}
      >
        <Tandwiel />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: DARK, color: CREAM, width: "100%", maxWidth: 480, maxHeight: "90dvh", overflowY: "auto",
              borderRadius: "12px 12px 0 0", padding: "18px 20px 26px", boxSizing: "border-box",
              boxShadow: "0 -4px 20px rgba(0,0,0,.4)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, letterSpacing: "0.03em" }}>{vertaal("Settings")}</div>

            <label style={{ display: "block", fontSize: 14, fontWeight: 800, marginBottom: 6 }} htmlFor="thuisspot">
              {vertaal("Home spot")}
            </label>
            <select
              id="thuisspot"
              value={homeSpotId || ""}
              onChange={kies}
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                border: `2px solid ${CREAM}`, background: "transparent", color: CREAM,
                colorScheme: "dark", fontFamily: "inherit",
              }}
            >
              <option value="" style={{ color: "#000" }}>{vertaal("None")}</option>
              {opNaam.map((s) => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>)}
            </select>
            <div style={{ fontSize: 12, opacity: 0.7, margin: "6px 0 20px", lineHeight: 1.5 }}>
              {vertaal("The app always opens on this spot and shows it with a house icon on the map.")}
            </div>

            <FeedbackFormulier />

            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 16, width: "100%", border: `2px solid ${CREAM}`,
                borderRadius: 8, padding: "10px 0", background: "transparent",
                color: CREAM, fontSize: 14, fontWeight: 800, cursor: "pointer",
              }}
            >
              {vertaal("Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
