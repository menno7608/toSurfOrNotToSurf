import { useEffect, useState } from "react";
import { t as vertaal, useTaal } from "../taal.js";

/* De service worker activeert nieuwe versies zelf op de achtergrond
   (skipWaiting + clients.claim) — maar wie de app al open had staan, bleef
   op de oude JS draaien zonder dat ergens stond dat er een update was. Deze
   toast meldt het alleen als er al een eerdere versie actief was (anders
   zie je 'm ook bij de allereerste installatie, wat niemand iets zegt). */
const DARK = "#1a2635";
const CREAM = "#f0ebe0";

export default function UpdateToast() {
  useTaal();
  const [beschikbaar, setBeschikbaar] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadController) setBeschikbaar(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!beschikbaar) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        position: "fixed", left: 12, right: 12, top: 12, zIndex: 10002,
        border: `2px solid ${CREAM}`, borderRadius: 8,
        padding: "10px 14px", background: DARK, color: CREAM,
        boxShadow: "0 3px 12px rgba(0,0,0,.35)", fontSize: 14,
        fontWeight: 800, cursor: "pointer", textAlign: "center",
      }}
    >
      {vertaal("New version ready — tap to refresh")}
    </button>
  );
}
