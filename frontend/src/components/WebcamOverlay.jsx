import React from "react";
import WEBCAMS from "../webcams.js";
import { useTheme } from "../theme.js";

export default function WebcamOverlay({ spot }) {
  const C = useTheme();
  const raw = WEBCAMS[spot?.id];
  const webcamUrl = spot?.webcam;

  // Normaliseer: string (legacy) of array van { label, url }
  const cams = raw
    ? (typeof raw === "string" ? [{ label: "CAM", url: raw }] : raw)
    : null;

  const [activeIdx, setActiveIdx] = React.useState(0);

  // Reset naar eerste cam als spot wisselt
  React.useEffect(() => { setActiveIdx(0); }, [spot?.id]);

  if (cams) {
    const activeCam = cams[activeIdx] ?? cams[0];
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Cam-switcher — alleen zichtbaar als er ≥2 cams zijn */}
        {cams.length > 1 && (
          <div style={{
            display: "flex", gap: 6, padding: "8px 12px",
            background: "#000", flexShrink: 0,
          }}>
            {cams.map((cam, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
                  padding: "4px 12px", borderRadius: 3,
                  border: `1.5px solid ${i === activeIdx ? C.border : "#444"}`,
                  background: i === activeIdx ? C.border : "transparent",
                  color: i === activeIdx ? "#000" : "#888",
                  cursor: "pointer", outline: "none",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {cam.label}
              </button>
            ))}
          </div>
        )}
        <iframe
          key={activeCam.url}
          src={activeCam.url}
          title={activeCam.label}
          allow="autoplay; fullscreen"
          allowFullScreen
          style={{ flex: 1, border: "none", display: "block", width: "100%" }}
        />
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      padding: 32, textAlign: "center",
    }}>
      <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={1.5} strokeLinecap="round">
        <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em" }}>
        NO LIVE STREAM
      </span>
      {webcamUrl ? (
        <a
          href={webcamUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: C.border, fontSize: 12, fontWeight: 700,
            border: `1px solid ${C.border}`, borderRadius: 4,
            padding: "6px 14px", textDecoration: "none", letterSpacing: "0.06em",
          }}
        >
          Open webcam in browser →
        </a>
      ) : (
        <span style={{ color: "#888", fontSize: 11 }}>No webcam available for {spot?.name}</span>
      )}
    </div>
  );
}
