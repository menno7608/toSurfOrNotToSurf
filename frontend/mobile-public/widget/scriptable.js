// toSurfOrNotToSurf — homescreen-widget voor Scriptable (iPhone).
// Installeren: kopieer dit script via Instellingen → Widget in de app, plak het
// in een nieuw Scriptable-script, voeg een Scriptable-widget toe aan je
// beginscherm en kies dit script. Een andere spot? Zet het spot-id in het
// veld "Parameter" van de widget.
const SPOT = args.widgetParameter || "__SPOT__";
const API = "https://tosurfornottosurf.nl/api/widget?spot=" + encodeURIComponent(SPOT);

const KLEUR = { go: "#2ecc71", bijna: "#f5a623", nee: "#8a96a3" };
const TEKST = { go: "GO", bijna: "BIJNA", nee: "NEE" };

async function haal() {
  try {
    const r = new Request(API);
    r.timeoutInterval = 15;
    return await r.loadJSON();
  } catch (e) {
    return null;
  }
}

function pijl(graden) {
  if (graden == null) return "";
  const pijlen = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]; // wind KOMT uit graden
  return pijlen[Math.round(graden / 45) % 8];
}

const d = await haal();
const w = new ListWidget();
w.backgroundColor = new Color("#1a2635");
w.setPadding(14, 14, 14, 14);

if (!d || d.error) {
  const t = w.addText("Geen data");
  t.textColor = Color.white();
  t.font = Font.boldSystemFont(16);
  w.url = "https://tosurfornottosurf.nl/mobile/";
} else {
  const naam = w.addText(d.name);
  naam.textColor = Color.white();
  naam.font = Font.semiboldSystemFont(14);
  naam.lineLimit = 1;

  w.addSpacer(6);
  const wind = w.addText((d.windKn ?? "–") + " kn " + pijl(d.dir));
  wind.textColor = Color.white();
  wind.font = Font.boldSystemFont(30);
  wind.minimumScaleFactor = 0.6;

  const vlaag = w.addText("vlagen " + (d.gustKn ?? "–") + (d.shore ? " · " + d.shore.toLowerCase() : ""));
  vlaag.textColor = new Color("#c0c9d2");
  vlaag.font = Font.systemFont(11);
  vlaag.lineLimit = 1;

  w.addSpacer();
  const o = d.oordeel;
  const label = w.addText(o ? TEKST[o] : "geen oordeel");
  label.textColor = new Color(o ? KLEUR[o] : "#8a96a3");
  label.font = Font.heavySystemFont(16);
  w.url = d.url;
}

w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else await w.presentSmall();
Script.complete();
