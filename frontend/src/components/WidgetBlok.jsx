import { useState } from "react";
import { t as vertaal } from "../taal.js";

const CREAM = "#f0ebe0";

const knop = {
  border: `1px solid ${CREAM}`, borderRadius: 8, padding: "8px 14px", background: "transparent",
  color: CREAM, fontSize: 13, fontWeight: 700, cursor: "pointer", marginRight: 8, marginTop: 8,
};
const tekst = { fontSize: 12, opacity: 0.85, lineHeight: 1.5 };

async function kopieer(inhoud) {
  try { await navigator.clipboard.writeText(inhoud); return true; }
  catch { return false; }
}

export default function WidgetBlok({ homeSpotId = "" }) {
  const [status, setStatus] = useState("");
  const android = /android/i.test(navigator.userAgent);

  const basis = homeSpotId ? `${window.location.origin}/api/widget?spot=${encodeURIComponent(homeSpotId)}` : "";
  // KWGT leest een tekstregel met $wg(url, txt)$.
  const formule = basis ? `$wg("${basis}&format=text", txt)$` : "";

  const meld = async (belofte) => setStatus((await belofte) ? "Copied" : "Copy failed");

  const kopieerScript = () => meld((async () => {
    try {
      const inhoud = await (await fetch("/mobile/widget/scriptable.js", { cache: "no-store" })).text();
      return await kopieer(inhoud.replace("__SPOT__", homeSpotId));
    } catch { return false; }
  })());

  const androidDeel = (
    <div>
      <div style={{ ...tekst, fontWeight: 800, opacity: 1 }}>Android</div>
      <ol style={{ ...tekst, margin: "4px 0 0", paddingLeft: 18, listStyle: "decimal" }}>
        <li>{vertaal("Install KWGT Kustom Widget Maker and its Pro key from the Play Store.")}</li>
        <li>{vertaal("Long-press your home screen, add a KWGT widget and tap it to edit.")}</li>
        <li>{vertaal("Add a text item, choose a formula and paste the one you copy here.")}</li>
      </ol>
      <button type="button" style={knop} onClick={() => meld(kopieer(formule))}>{vertaal("Copy KWGT formula")}</button>
    </div>
  );

  const iphoneDeel = (
    <div>
      <div style={{ ...tekst, fontWeight: 800, opacity: 1 }}>iPhone</div>
      <div style={tekst}>
        {vertaal("Install the free Scriptable app, copy the script, paste it into a new script and add a Scriptable widget to your home screen.")}
      </div>
      <button type="button" style={knop} onClick={kopieerScript}>{vertaal("Copy iPhone script")}</button>
    </div>
  );

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{vertaal("Phone widget")}</div>
      {!homeSpotId ? (
        <div style={{ ...tekst, opacity: 0.7 }}>{vertaal("Choose a home spot first — the widget shows that spot.")}</div>
      ) : (
        <>
          {android ? androidDeel : iphoneDeel}
          <div style={{ height: 12 }} />
          {android ? iphoneDeel : androidDeel}
          {status && <div role="status" style={{ ...tekst, marginTop: 8 }}>{vertaal(status)}</div>}
        </>
      )}
    </div>
  );
}
