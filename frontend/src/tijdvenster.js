import { useSyncExternalStore } from "react";

/* Gedeeld tijdvenster van de windgrafiek en de golf-, energie- en
   stroomgrafieken: wie er ook versleept wordt, de rest volgt, zodat je altijd
   wind en golven van hetzelfde moment ziet (20-10).

   Tijden zijn spotlokaal, als "nep-UTC" in ms — dezelfde conventie als
   `${date}T${t}:00Z` elders in de grafieken. `bron` voorkomt dat een grafiek
   op zijn eigen melding reageert. */
let venster = null;
const luisteraars = new Set();

export function zetVenster(start, eind, bron) {
  if (!Number.isFinite(start) || !Number.isFinite(eind) || eind <= start) return;
  venster = { start, eind, bron };
  luisteraars.forEach((f) => f());
}

export function useVenster() {
  return useSyncExternalStore(
    (f) => { luisteraars.add(f); return () => luisteraars.delete(f); },
    () => venster,
  );
}

export const msVan = (date, t) => Date.parse(`${date}T${t}:00Z`);

/* NU-knop: alle grafieken terug naar het huidige moment. Het venster gaat
   weg (minigrafieken vallen terug op "rond nu"), en de windgrafiek scrolt
   naar nu en meldt daarna zelf het nieuwe venster. */
let nuTeller = 0;
const nuLuisteraars = new Set();
export function naarNu() {
  nuTeller += 1;
  venster = null;
  luisteraars.forEach((f) => f());
  nuLuisteraars.forEach((f) => f());
}
export function useNuTeller() {
  return useSyncExternalStore(
    (f) => { nuLuisteraars.add(f); return () => nuLuisteraars.delete(f); },
    () => nuTeller,
  );
}
