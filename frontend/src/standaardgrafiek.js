import { useEffect, useState } from "react";

/* Welke grafiek (WIND, CURRENT, WAVES, TIDE, RAIN) opent als je een spot opent. Eén
   voorkeur per apparaat, in localStorage, instelbaar onder Instellingen. */

const SLEUTEL = "standaardGrafiek";
const EVENT = "standaardGrafiek";
export const GRAFIEKEN = [
  { id: "wind", label: "WIND" },
  { id: "current", label: "CURRENT" },
  { id: "waves", label: "WAVES" },
  { id: "tide", label: "TIDE" },
  { id: "rain", label: "RAIN" },
];

export function leesStandaard() {
  try {
    const v = localStorage.getItem(SLEUTEL);
    if (GRAFIEKEN.some((g) => g.id === v)) return v;
  } catch { /* privévenster */ }
  return "wind";
}

export function zetStandaard(id) {
  try { localStorage.setItem(SLEUTEL, id); } catch { /* privévenster */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Zelfde regels als de tabs in ChartTabs: niet elke spot heeft elke grafiek. */
export function beschikbaar(spot, id) {
  if (id === "current") return spot?.shore_angle != null;
  if (id === "waves") return (spot?.marine?.length ?? 0) > 0;
  if (id === "tide") return (spot?.marine ?? []).some((p) => p.tide != null);
  return true;
}

export function useStandaardGrafiek() {
  const [waarde, setWaarde] = useState(leesStandaard);
  useEffect(() => {
    const bijwerken = () => setWaarde(leesStandaard());
    window.addEventListener(EVENT, bijwerken);
    return () => window.removeEventListener(EVENT, bijwerken);
  }, []);
  return waarde;
}
