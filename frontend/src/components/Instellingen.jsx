import { useState } from "react";
import FeedbackFormulier from "./FeedbackFormulier.jsx";
import WidgetBlok from "./WidgetBlok.jsx";
import { t as vertaal } from "../taal.js";
import { useVuurwerk, zetVuurwerk, VUURWERK_INTERVALLEN, VUURWERK_DUUR_OPTIES, VUURWERK_PROEF } from "../vuurwerk.js";

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

export default function Instellingen({ spots = [], homeSpotId = "", onHomeSpot, onSelectSpot, kaartAan = true, onKaartToggle, color = CREAM, knopStijl = {} }) {
  const [open, setOpen] = useState(false);
  const vw = useVuurwerk();

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
        className="knop-compact"
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

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, lineHeight: 1.4, cursor: "pointer", marginBottom: 20 }}>
              <input type="checkbox" checked={kaartAan} onChange={(e) => onKaartToggle?.(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#60b8e8", flexShrink: 0 }} />
              {vertaal("Show map as background")}
            </label>

            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{vertaal("Fireworks")}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, lineHeight: 1.4, cursor: "pointer" }}>
              <input type="checkbox" checked={vw.aan} onChange={(e) => zetVuurwerk({ aan: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: "#60b8e8", flexShrink: 0 }} />
              {vertaal("Show fireworks on days that match my alarm")}
            </label>
            <label htmlFor="vuurwerk-elke" style={{ display: "block", fontSize: 13, opacity: vw.aan ? 0.85 : 0.4, margin: "12px 0 4px" }}>
              {vertaal("Repeat while viewing such a day")}
            </label>
            <select
              id="vuurwerk-elke" disabled={!vw.aan} value={vw.elke}
              onChange={(e) => zetVuurwerk({ elke: Number(e.target.value) })}
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                border: `2px solid ${CREAM}`, background: "transparent", color: CREAM,
                colorScheme: "dark", fontFamily: "inherit", opacity: vw.aan ? 1 : 0.4,
              }}
            >
              {VUURWERK_INTERVALLEN.map((o) => <option key={o.waarde} value={o.waarde} style={{ color: "#000" }}>{vertaal(o.label)}</option>)}
            </select>
            <label htmlFor="vuurwerk-duur" style={{ display: "block", fontSize: 13, opacity: vw.aan ? 0.85 : 0.4, margin: "12px 0 4px" }}>
              {vertaal("Animation speed")}
            </label>
            <select
              id="vuurwerk-duur" disabled={!vw.aan} value={vw.duur}
              onChange={(e) => zetVuurwerk({ duur: Number(e.target.value) })}
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                border: `2px solid ${CREAM}`, background: "transparent", color: CREAM,
                colorScheme: "dark", fontFamily: "inherit", opacity: vw.aan ? 1 : 0.4,
              }}
            >
              {VUURWERK_DUUR_OPTIES.map((o) => <option key={o.waarde} value={o.waarde} style={{ color: "#000" }}>{vertaal(o.label)}</option>)}
            </select>
            <button
              type="button" disabled={!vw.aan}
              onClick={() => { setOpen(false); setTimeout(() => window.dispatchEvent(new Event(VUURWERK_PROEF)), 350); }}
              style={{
                marginTop: 10, border: `1px solid ${CREAM}`, borderRadius: 8, padding: "6px 14px",
                background: "transparent", color: CREAM, fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: vw.aan ? 1 : 0.4,
              }}
            >
              {vertaal("Preview")}
            </button>
            <div style={{ fontSize: 12, opacity: 0.7, margin: "8px 0 20px", lineHeight: 1.5 }}>
              {vertaal("Set a sport under ALARM first — fireworks appear on the days it matches.")}
            </div>

            <WidgetBlok homeSpotId={homeSpotId} />

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
