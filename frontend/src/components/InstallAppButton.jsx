import { useEffect, useState } from "react";
import { t as vertaal, useTaal } from "../taal.js";

/* Deze knop hing volledig aan `beforeinstallprompt`. Dat event vuurt alleen in
   Chromium, en alleen zolang de app nog niet geïnstalleerd is — dus zag je geen
   knop zodra je hem één keer had geïnstalleerd, en op iOS nooit, want WebKit
   kent het event niet. Nu staat de knop er altijd (behalve als je al ín de
   geïnstalleerde app zit) en valt hij terug op uitleg per browser.

   De sheet opent nu ook vanzelf bij het eerste bezoek (eenmalig, via
   localStorage) — mensen komen via een Instagram-storylink en weten niet dat
   er een installeerbare app is. `prompt.prompt()` vereist een user gesture,
   dus op Chrome/Android staat er direct een knop die de native installprompt
   start zodra je 'm aantikt; op iOS/overig staan de stappen meteen zichtbaar. */
const GEZIEN_KEY = "installUitlegGezien";

const DARK = "#1a2635";
const CREAM = "#f0ebe0";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true // iOS Safari kent display-mode niet
  );
}

function platform() {
  const ua = navigator.userAgent;
  // Links uit Instagram/Facebook/TikTok openen in een ingebouwde browser: daar
  // kan niets geïnstalleerd worden en bestaat het ⋮-menu niet.
  if (/Instagram|FBAN|FBAV|TikTok|musical_ly/i.test(ua)) return "in-app";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    // Op iOS draait élke browser op WebKit; alleen Safari kan naar het beginscherm.
    return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios-safari";
  }
  return "android";
}

const STEPS = {
  "in-app": [
    "You're in Instagram's browser — the app can't be installed from here.",
    "Tap ⋯ (or ⋮) at the top right and choose 'Open in browser' (Safari or Chrome).",
    "Then tap 'Install app'.",
  ],
  "ios-safari": [
    "Tap the share icon at the bottom (square with an arrow up).",
    "Choose 'Add to Home Screen'.",
    "Tap 'Add'.",
  ],
  "ios-other": [
    "First open this page in Safari — only Safari can add it to the home screen.",
    "Then tap the share icon (square with an arrow up).",
    "Choose 'Add to Home Screen'.",
  ],
  android: [
    "Tap your browser's menu (⋮ top right).",
    "Choose 'Install app' or 'Add to Home screen'.",
    "Not there? Then the app is already installed — check your home screen.",
  ],
};

export default function InstallAppButton() {
  useTaal();
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [uitleg, setUitleg] = useState(false);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setUitleg(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (installed) return;
    let gezien = false;
    try {
      gezien = localStorage.getItem(GEZIEN_KEY) === "1";
    } catch {
      // localStorage kan geblokkeerd zijn (privénavigatie) — dan gewoon tonen.
    }
    if (!gezien) setUitleg(true);
  }, [installed]);

  if (installed) return null;

  const sluitUitleg = () => {
    setUitleg(false);
    try {
      localStorage.setItem(GEZIEN_KEY, "1");
    } catch {
      // zie hierboven
    }
  };

  const install = async () => {
    if (!prompt) {
      setUitleg(true);
      return;
    }
    const gebruikt = prompt;
    // Een beforeinstallprompt kan maar één keer: na "annuleren" nogmaals
    // .prompt() geeft een InvalidStateError, dus altijd weggooien.
    setPrompt(null);
    sluitUitleg();
    try {
      await gebruikt.prompt();
      await gebruikt.userChoice;
    } catch {
      setUitleg(true);
    }
  };

  const stappen = STEPS[platform()];

  return (
    <>
      <button
        type="button"
        onClick={install}
        style={{
          position: "fixed", right: 12, bottom: 12, zIndex: 10000,
          border: `2px solid ${CREAM}`, borderRadius: 8,
          padding: "10px 14px", background: DARK, color: CREAM,
          boxShadow: "0 3px 12px rgba(0,0,0,.35)", fontSize: 14,
          fontWeight: 800, cursor: "pointer",
        }}
      >
        {vertaal("Install app")}
      </button>

      {uitleg && (
        <div
          onClick={sluitUitleg}
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: DARK, color: CREAM, width: "100%", maxWidth: 480,
              borderRadius: "12px 12px 0 0", padding: "18px 20px 26px",
              boxShadow: "0 -4px 20px rgba(0,0,0,.4)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10, letterSpacing: "0.03em" }}>
              {vertaal("Add this app to your home screen")}
            </div>

            {prompt ? (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>
                  {vertaal("One tap and you have it as an app on your home screen.")}
                </div>
                <button
                  type="button"
                  onClick={install}
                  style={{
                    width: "100%", border: `2px solid ${CREAM}`, borderRadius: 8,
                    padding: "12px 0", background: CREAM, color: DARK,
                    fontSize: 15, fontWeight: 800, cursor: "pointer",
                  }}
                >
                  {vertaal("Install app")}
                </button>
              </>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
                {stappen.map((s) => <li key={s}>{vertaal(s)}</li>)}
              </ol>
            )}

            <button
              type="button"
              onClick={sluitUitleg}
              style={{
                marginTop: 16, width: "100%", border: `2px solid ${CREAM}`,
                borderRadius: 8, padding: "10px 0", background: "transparent",
                color: CREAM, fontSize: 14, fontWeight: 800, cursor: "pointer",
              }}
            >
              {vertaal(prompt ? "Not now" : "Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
