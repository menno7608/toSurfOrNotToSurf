import { useSyncExternalStore } from "react";

/* Taal van de app: Nederlands of Engels (20-10). Teksten in de code staan in
   het Engels en zijn hun eigen sleutel; `t()` geeft in het Nederlands de
   vertaling hieronder, of de tekst zelf als die er (nog) niet in staat.
   Standaard de taal van de browser, daarna wat de bezoeker kiest. */

const NL = {
  // Tabbladen en kop
  WIND: "WIND", CURRENT: "STROMING", WAVES: "GOLVEN", TIDE: "GETIJ", RAIN: "REGEN",
  NOW: "NU", "Back to now": "Terug naar nu", TIME: "TIJD", TEMPERATURE: "TEMPERATUUR", "SPOT NAME": "SPOT",
  Air: "Lucht", Water: "Water", "Feels like:": "Voelt als:", Feels: "Voelt",
  MAP: "KAART", LIGHT: "LICHT", DARK: "DONKER", "✕ MAP": "✕ KAART",
  "Auto-rotate favourites (30s)": "Favorieten afwisselen (30s)", "Add ≥2 favourites": "Voeg ≥2 favorieten toe",
  // Windgrafiek
  "Live WIND": "WIND LIVE", "updated at:": "bijgewerkt:", Measured: "Gemeten", "Measured wind": "Gemeten wind",
  "Past (model)": "Verleden (model)", Gust: "Windstoot", Forecast: "Verwachting", Now: "Nu",
  "Gust (meas.)": "Stoot (gemeten)", "Gust (fcst)": "Stoot (verwacht)", "Forecast:": "Verwachting:",
  "Measured:": "Gemeten:", "Direction:": "Richting:", "No wind data": "Geen winddata", "No data": "Geen data",
  "past:": "verleden:",
  // Wind ten opzichte van de kust
  "ON SHORE": "AANLANDIG", "SIDE-ON": "SCHUIN AANLANDIG", "SIDE SHORE": "SIDESHORE",
  "SIDE-OFF": "SCHUIN AFLANDIG", "OFF SHORE": "AFLANDIG",
  ONSHORE: "AANLANDIG", ANGLED: "SCHUIN", SIDE: "ZIJWAARTS", OFFSHORE: "AFLANDIG",
  // Golven en stroming
  GROUNDSWELL: "GRONDDEINING", SWELL: "DEINING", WINDSWELL: "WINDGOLVEN", CHOP: "ROMMELIG",
  WEAK: "ZWAK", MODERATE: "MATIG", STRONG: "STERK", FLOOD: "VLOED", EBB: "EB", CROSS: "DWARS",
  RISING: "STIJGEND", FALLING: "DALEND", ENERGY: "ENERGIE", "WAVE HEIGHT": "GOLFHOOGTE",
  "SWELL PERIOD": "DEININGSPERIODE", "WAVE ENERGY": "GOLFENERGIE", now: "nu", CLEAN: "SCHOON",
  // Zijbalk en telefoon
  "SPOT INFO": "SPOTINFO", "WEATHER MODEL": "WEERMODEL", Wind: "Wind", Direction: "Richting",
  Wave: "Golf", Period: "Periode", Current: "Stroming", Energy: "Energie", Tide: "Getij", Dir: "Richting",
  DIRECTION: "RICHTING", "WAVE Hs": "GOLF Hs", PERIOD: "PERIODE", today: "vandaag",
  "Best Match (auto)": "Beste match (auto)", "Remove pinned model": "Vastgezet model weghalen",
  "Pin as default for this spot": "Vastzetten als standaard voor deze spot",
  "Remove favourite model": "Favoriet model weghalen", "Save as favourite model for this spot": "Bewaar als favoriet model voor deze spot",
  "Loading…": "Laden…",
  // Alarm
  "ALARM RULES": "ALARMREGELS", "WIND DIRECTION": "WINDRICHTING", "Min. wind": "Min. wind", "Max. wind": "Max. wind",
  "Min. wave height": "Min. golfhoogte", "Min. period": "Min. periode", OFF: "UIT",
  "hour of good conditions found": "uur met goede omstandigheden gevonden",
  "hours of good conditions found": "uur met goede omstandigheden gevonden",
  "Push notifications coming soon": "Pushmeldingen volgen binnenkort", KITE: "KITE", SURF: "SURF",
  // Instellingen, feedback, installeren, update
  Settings: "Instellingen", "Home spot": "Thuisspot", None: "Geen",
  "The app always opens on this spot and shows it with a house icon on the map.":
    "De app opent altijd op deze spot en toont hem met een huisje op de kaart.",
  "Phone widget": "Telefoonwidget",
  "Choose a home spot first — the widget shows that spot.": "Kies eerst een thuisspot — de widget toont die spot.",
  "iPhone: install the free Scriptable app, copy the script, paste it into a new script and add a Scriptable widget to your home screen.":
    "iPhone: installeer de gratis app Scriptable, kopieer het script, plak het in een nieuw script en zet een Scriptable-widget op je beginscherm.",
  "Android: use a widget app such as KWGT and point it at this address.":
    "Android: gebruik een widget-app zoals KWGT en wijs die naar dit adres.",
  "Copy iPhone script": "Kopieer iPhone-script", "Copy widget address": "Kopieer widget-adres",
  Copied: "Gekopieerd", "Copy failed": "Kopiëren lukte niet",
  "Idea or bug?": "Idee of foutje?",
  "What would you like to see, or what isn't working well?": "Wat zou je willen zien, of wat werkt niet goed?",
  Send: "Versturen", "Sending…": "Versturen…", Close: "Sluiten",
  "That didn't work. Please try again.": "Dat ging niet goed. Probeer het nog eens.",
  "Sent — it goes straight to the maker. Thanks!": "Verstuurd — komt rechtstreeks bij de maker terecht. Bedankt!",
  "Install app": "App installeren", "Add this app to your home screen": "Zet deze app op je beginscherm",
  "One tap and you have it as an app on your home screen.": "Eén tik en je hebt 'm als app op je beginscherm.",
  "Not now": "Niet nu",
  "New version ready — tap to refresh": "Nieuwe versie klaar — tik om te verversen",
  "Tap the share icon at the bottom (square with an arrow up).": "Tik op het deel-icoon onderin (vierkant met pijl omhoog).",
  "Choose 'Add to Home Screen'.": "Kies 'Zet op beginscherm'.",
  "Tap 'Add'.": "Tik op 'Voeg toe'.",
  "First open this page in Safari — only Safari can add it to the home screen.":
    "Open deze pagina eerst in Safari — alleen Safari kan naar het beginscherm.",
  "Then tap the share icon (square with an arrow up).": "Tik daar op het deel-icoon (vierkant met pijl omhoog).",
  "Tap your browser's menu (⋮ top right).": "Tik op het menu van je browser (⋮ rechtsboven).",
  "Choose 'Install app' or 'Add to Home screen'.": "Kies 'App installeren' of 'Toevoegen aan startscherm'.",
  "Not there? Then the app is already installed — check your home screen.":
    "Staat dat er niet? Dan is de app al geïnstalleerd — kijk op je startscherm.",
  "You're in Instagram's browser — the app can't be installed from here.":
    "Je zit nu in de browser van Instagram — daar kun je de app niet installeren.",
  "Tap ⋯ (or ⋮) at the top right and choose 'Open in browser' (Safari or Chrome).":
    "Tik op de ⋯ (of ⋮) rechtsboven en kies 'Openen in browser' (Safari of Chrome).",
  "Then tap 'Install app'.": "Tik daar op 'App installeren'.",
  Fireworks: "Vuurwerk",
  "Show fireworks on days that match my alarm": "Vuurwerk tonen op dagen die aan mijn alarm voldoen",
  "Repeat while viewing such a day": "Herhalen zolang je zo'n dag bekijkt",
  "Every 15 seconds": "Elke 15 seconden", "Every 30 seconds": "Elke 30 seconden",
  "Every minute": "Elke minuut", "Every 5 minutes": "Elke 5 minuten",
  "Only when opening the app": "Alleen bij het openen van de app",
  "Show map as background": "Kaart tonen als achtergrond",
  Preview: "Voorbeeld",
  "Set a sport under ALARM first — fireworks appear on the days it matches.":
    "Stel eerst een sport in onder ALARM — het vuurwerk verschijnt op de dagen die passen.",
  "Animation speed": "Snelheid van de animatie",
  Faster: "Sneller", Normal: "Normaal", Slower: "Langzamer", "Much slower": "Veel langzamer",
};

const SLEUTEL = "taal";
function beginTaal() {
  try {
    const opgeslagen = localStorage.getItem(SLEUTEL);
    if (opgeslagen === "nl" || opgeslagen === "en") return opgeslagen;
  } catch { /* privévenster: dan de browsertaal */ }
  return (navigator.language || "").toLowerCase().startsWith("nl") ? "nl" : "en";
}

let taal = beginTaal();
const luisteraars = new Set();

export function zetTaal(nieuw) {
  taal = nieuw;
  try { localStorage.setItem(SLEUTEL, nieuw); } catch { /* niet bewaren is geen ramp */ }
  document.documentElement.lang = nieuw;
  luisteraars.forEach((f) => f());
}

/* Voor de top van de app: laat alles opnieuw tekenen als de taal wisselt. */
export function useTaal() {
  return useSyncExternalStore(
    (f) => { luisteraars.add(f); return () => luisteraars.delete(f); },
    () => taal,
  );
}

export const huidigeTaal = () => taal;
export const t = (tekst) => (taal === "nl" ? NL[tekst] ?? tekst : tekst);
export const locale = () => (taal === "nl" ? "nl-NL" : "en-GB");

if (typeof document !== "undefined") document.documentElement.lang = taal;
