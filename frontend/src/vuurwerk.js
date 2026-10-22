import { useSyncExternalStore } from "react";

/* Instellingen van het vuurwerk in de weekbalk (aan/uit en hoe vaak het zich
   herhaalt zolang je een passende dag bekijkt). Gedeeld tussen het
   instellingenscherm en de weekbalk, zodat een wijziging meteen werkt. */
const SLEUTEL = "vuurwerkInst";
// elke: seconden, 0 = alleen bij het openen van de app.
// duur: snelheidsfactor — 1 is de oorspronkelijke tijd, hoger is langzamer.
// Op het wandscherm vanaf een paar meter afstand oogde de animatie te snel.
const STANDAARD = { aan: false, elke: 60, duur: 1 };

function lees() {
  try {
    const o = JSON.parse(localStorage.getItem(SLEUTEL) || "null");
    if (o && typeof o === "object") return { ...STANDAARD, ...o };
  } catch { /* privévenster: standaardwaarden */ }
  return { ...STANDAARD };
}

let waarde = lees();
const luisteraars = new Set();

export function zetVuurwerk(deel) {
  waarde = { ...waarde, ...deel };
  try { localStorage.setItem(SLEUTEL, JSON.stringify(waarde)); } catch { /* niet bewaren is geen ramp */ }
  luisteraars.forEach((f) => f());
}

export function useVuurwerk() {
  return useSyncExternalStore(
    (f) => { luisteraars.add(f); return () => luisteraars.delete(f); },
    () => waarde,
  );
}

export const VUURWERK_INTERVALLEN = [
  { waarde: 15, label: "Every 15 seconds" },
  { waarde: 30, label: "Every 30 seconds" },
  { waarde: 60, label: "Every minute" },
  { waarde: 300, label: "Every 5 minutes" },
  { waarde: 0, label: "Only when opening the app" },
];

export const VUURWERK_DUUR_OPTIES = [
  { waarde: 0.7, label: "Faster" },
  { waarde: 1, label: "Normal" },
  { waarde: 1.5, label: "Slower" },
  { waarde: 2, label: "Much slower" },
];

// Het instellingenscherm vraagt hiermee om een proefvuurwerk in de weekbalk.
export const VUURWERK_PROEF = "vuurwerk-proef";
