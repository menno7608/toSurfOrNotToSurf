// toSurfOrNotToSurf — widget voor Scriptable (iPhone).
// De server tekent de widget; dit script toont alleen die afbeelding. Verbeteringen aan het
// ontwerp komen dus vanzelf binnen, zonder dat je dit script opnieuw hoeft te plakken.
//
// Instellen via het veld "Parameter" van de widget (lang indrukken > Widget aanpassen):
//   spot|grafiek|thema        bijvoorbeeld   scheveningen|golven|donker
//   grafiek: wind, regen, golven, getij, stroom (standaard wind)
//   thema:   licht of donker (standaard: volgt je telefoon)
// Tip: zet meerdere widgets met een andere grafiek op elkaar in een widgetstapel
// en veeg er verticaal doorheen.
const DELEN = (args.widgetParameter || "").split("|").map((s) => s.trim());
const SPOT = DELEN[0] || "__SPOT__";
const GRAFIEK = DELEN[1] || "wind";
const THEMA = DELEN[2] || (Device.isUsingDarkAppearance() ? "donker" : "licht");
const BASIS = "https://tosurfornottosurf.nl";

const maten = { small: [420, 420], medium: [720, 340], large: [720, 780], extraLarge: [1100, 520] };
const [B, H] = maten[config.widgetFamily] || maten.medium;
const url = `${BASIS}/api/widget-beeld?spot=${encodeURIComponent(SPOT)}&soort=volledig&grafiek=${encodeURIComponent(GRAFIEK)}`
  + `&thema=${THEMA}&w=${B}&h=${H}&dp=${config.widgetFamily === "small" ? 155 : 329}`;

const w = new ListWidget();
w.url = `${BASIS}/mobile/?spot=${encodeURIComponent(SPOT)}`;
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
try {
  const r = new Request(url);
  r.timeoutInterval = 20;
  w.backgroundImage = await r.loadImage();
} catch (e) {
  w.backgroundColor = new Color(THEMA === "donker" ? "#1a2635" : "#f0ebe0");
  const t = w.addText("Geen data");
  t.textColor = new Color(THEMA === "donker" ? "#c8c0b0" : "#2d3f4a");
}
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
