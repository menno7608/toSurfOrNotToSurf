import { useState } from "react";
import { t as vertaal } from "../taal.js";

const CREAM = "#f0ebe0";
const ORANJE = "#e8913e";

const hoofdknop = {
  display: "block", width: "100%", boxSizing: "border-box", textAlign: "center", textDecoration: "none",
  border: `2px solid ${ORANJE}`, borderRadius: 10, padding: "12px 14px", background: ORANJE,
  color: "#1a2635", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10,
};
const tekst = { fontSize: 13, lineHeight: 1.5, opacity: 0.9 };

async function kopieer(inhoud) {
  try { await navigator.clipboard.writeText(inhoud); return true; }
  catch { return false; }
}

export default function WidgetBlok({ homeSpotId = "" }) {
  const [status, setStatus] = useState("");
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const kopieerScript = async () => {
    try {
      const inhoud = await (await fetch("/mobile/widget/scriptable.js", { cache: "no-store" })).text();
      const ok = await kopieer(inhoud.replace("__SPOT__", homeSpotId));
      setStatus(ok ? "Script copied — now open Scriptable and paste it into a new script." : "Copy failed");
    } catch {
      setStatus("Copy failed");
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{vertaal("Widget on your home screen")}</div>
      <div style={tekst}>{vertaal("See the wind of your spot without opening the app.")}</div>

      {!ios ? (
        <>
          <a href={`/mobile/widget/tosurfornottosurf.apk?t=${Date.now()}`} download="tosurfornottosurf.apk" style={hoofdknop}>
            {vertaal("Install widget")}
          </a>
          <ol style={{ ...tekst, margin: "10px 0 0", paddingLeft: 18, listStyle: "decimal" }}>
            <li>{vertaal("Tap the downloaded file and choose Install. Allow it once if your phone asks.")}</li>
            <li>{vertaal("Long-press an empty spot on your home screen, tap Widgets and pick toSurfOrNotToSurf.")}</li>
            <li>{vertaal("Choose your spot.")}</li>
            <li>{vertaal("Later updates: open the widget app and tap Update.")}</li>
          </ol>
        </>
      ) : (
        <>
          <div style={{ ...tekst, marginTop: 8 }}>
            {vertaal("On iPhone a widget needs the free app Scriptable.")}
          </div>
          <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noreferrer" style={hoofdknop}>
            {vertaal("1. Get Scriptable")}
          </a>
          <button type="button" style={{ ...hoofdknop, background: "transparent", color: CREAM, border: `2px solid ${CREAM}` }}
            onClick={kopieerScript}>
            {vertaal("2. Copy widget script")}
          </button>
          <div style={{ ...tekst, marginTop: 8 }}>
            {vertaal("In Scriptable: tap +, paste, then add a Scriptable widget to your home screen.")}
          </div>
        </>
      )}
      {status && <div role="status" style={{ ...tekst, marginTop: 8 }}>{vertaal(status)}</div>}
    </div>
  );
}
