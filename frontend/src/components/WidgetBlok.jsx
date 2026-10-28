import { useState } from "react";
import { t as vertaal } from "../taal.js";

const CREAM = "#f0ebe0";

const knop = {
  border: `1px solid ${CREAM}`, borderRadius: 8, padding: "8px 14px", background: "transparent",
  color: CREAM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginRight: 8, marginTop: 8,
};

async function kopieer(tekst) {
  try { await navigator.clipboard.writeText(tekst); return true; }
  catch { return false; }
}

export default function WidgetBlok({ homeSpotId = "" }) {
  const [status, setStatus] = useState("");

  const url = homeSpotId
    ? `${window.location.origin}/api/widget?spot=${encodeURIComponent(homeSpotId)}`
    : "";

  const kopieerScript = async () => {
    try {
      const tekst = await (await fetch("/mobile/widget/scriptable.js", { cache: "no-store" })).text();
      const ok = await kopieer(tekst.replace("__SPOT__", homeSpotId));
      setStatus(ok ? "Copied" : "Copy failed");
    } catch {
      setStatus("Copy failed");
    }
  };

  const kopieerUrl = async () => setStatus((await kopieer(url)) ? "Copied" : "Copy failed");

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{vertaal("Phone widget")}</div>
      {!homeSpotId ? (
        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          {vertaal("Choose a home spot first — the widget shows that spot.")}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
            {vertaal("iPhone: install the free Scriptable app, copy the script, paste it into a new script and add a Scriptable widget to your home screen.")}
          </div>
          <button type="button" style={knop} onClick={kopieerScript}>{vertaal("Copy iPhone script")}</button>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5, marginTop: 12 }}>
            {vertaal("Android: use a widget app such as KWGT and point it at this address.")}
          </div>
          <button type="button" style={knop} onClick={kopieerUrl}>{vertaal("Copy widget address")}</button>
          {status && (
            <div role="status" style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>{vertaal(status)}</div>
          )}
        </>
      )}
    </div>
  );
}
