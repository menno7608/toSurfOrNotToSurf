import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme.js";
import { STRAAL_KM, glad, isobaren, pad, projectie } from "../kaart.js";
import { convertWind } from "./SpotInfo.jsx";
import { locale } from "../taal.js";

// Stroompijl: zelfde lichtblauw als de verwachting in de windgrafiek, zodat hij
// los van de oranje windpijl en de grijsblauwe kustlijn te zien is.
const STROOM = "#60b8e8";

/* Zwakke zeekaart achter de hele app: kustlijn + isobaren + de live wind- en
   stroompijl van de gekozen spot. Overgenomen uit de watersport-trainer-app
   (05-10-2026, "kaart als achtergrond"). `position:fixed` i.p.v. absoluut
   binnen één vak (07-10, op verzoek): alle vensters — header, sidebar,
   grafieken — mogen er nu doorheen kijken, met een vignet dat naar de
   schermrand toe opaker wordt zodat tekst daar leesbaar blijft. Andere
   spots, de thuisspot en isobaarlabels zijn weggelaten: te veel drukte voor
   wat decor moet blijven; de huidige inhoud blijft de hoofdzaak.
   Getekend als één stilstaand plaatje — zelfde reden als in de trainer-app:
   een levende SVG maakt trage toestellen merkbaar trager. */

const esc = (s) => String(s).replace(/[<>&"]/g, "");

function useEigenAfmeting() {
  const ref = useRef(null);
  const [m, setM] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setM({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, m];
}

const HUIS_PAD = "M4 10.8 12 4l8 6.8V20h-5.2v-5.6H9.2V20H4Z";

export default function KaartAchtergrond({ spot, spots = [], homeSpotId = "", unit = "kts", moment = null, compact = false }) {
  // Telefoon: alles kleiner, de pijlen liggen daar midden onder de grafiek.
  const sch = compact ? 0.6 : 1;
  // Telefoon: spot 12% van de schermhoogte lager dan het midden. In het midden
  // viel hij op de legenda en het kustlabel; iets lager ligt het lege bovenste
  // deel van de windgrafiek (20-50 kts).
  const omlaag = compact ? 0.12 : 0;
  const theme = useTheme();
  const [ref, { w, h }] = useEigenAfmeting();
  const [kust, setKust] = useState(null);
  const [druk, setDruk] = useState(null);
  const lat = spot?.location?.lat, lon = spot?.location?.lon;

  useEffect(() => {
    setKust(null);
    if (!spot?.id) return undefined;
    let weg = false;
    fetch(`/kust/${spot.id}.json`).then((r) => (r.ok ? r.json() : null)).then((k) => !weg && setKust(k)).catch(() => {});
    return () => { weg = true; };
  }, [spot?.id]);

  useEffect(() => {
    setDruk(null);
    if (lat == null) return undefined;
    let weg = false;
    const haal = () => fetch(`/api/drukkaart?lat=${lat}&lon=${lon}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => !weg && setDruk(d)).catch(() => {});
    haal();
    const t = setInterval(haal, 60 * 60 * 1000);
    return () => { weg = true; clearInterval(t); };
  }, [lat, lon]);

  // De spotlijst komt elke 10 minuten als nieuwe array binnen; alleen een echte
  // wijziging (andere spot, naam of plek) mag de kaart opnieuw tekenen.
  const spotsSig = useMemo(
    () => spots.map((s) => `${s.id}:${s.location?.lat},${s.location?.lon}:${s.name}`).join("|"),
    [spots]
  );

  const bron = useMemo(() => {
    if (lat == null || !w || !h || (!kust && !druk)) return null;
    const p = projectie(lat, lon);
    const schaal = Math.max(w, h) / (2 * STRAAL_KM);
    const vw = w / schaal, vh = h / schaal, vx = -vw / 2, vy = -vh / 2 - vh * omlaag;
    const px = (n) => (n / schaal).toFixed(2);
    const lijn = 'fill="none" stroke-linejoin="round" stroke-linecap="round"';
    const delen = [];
    const ring = (l) => `${pad(l.map(p))}Z`;

    // Terrein (land/isobaren/kust): eigen, lage dekking per laag — dit is decor.
    // Spot-markering en pijlen eronder blijven straks op volle kleur: dat is de
    // informatie waar het om gaat, geen decor.
    if (kust?.land) delen.push(`<path fill="${esc(theme.dark)}" fill-opacity="0.07" fill-rule="evenodd" d="${kust.land.map(ring).join("")}"/>`);
    if (kust?.meren?.length) delen.push(`<path fill="${esc(theme.cream)}" fill-rule="evenodd" d="${kust.meren.map(ring).join("")}"/>`);

    // Isobaren: alleen de lijnen, geen hPa-labels of H/L — te klein vak voor die drukte.
    if (druk) {
      const { lijnen } = isobaren(druk);
      delen.push(`<g stroke="${esc(theme.border)}" stroke-width="${px(1)}" stroke-opacity="0.3" ${lijn}>${lijnen.map((l) => `<path d="${pad(l.punten.map(p))}"/>`).join("")}</g>`);
    }

    // Kustlijn.
    if (kust) {
      const lijnen = [...(kust.kust || []).map((l) => pad(glad(l.map(p), 1))), ...(kust.meren || []).map(ring)];
      delen.push(`<g stroke="${esc(theme.border)}" stroke-width="${px(1.25)}" stroke-opacity="0.45" ${lijn}>${lijnen.map((d) => `<path d="${d}"/>`).join("")}</g>`);
    }

    // De andere spots in de buurt: stipje, en de naam erbij zolang hij niet op de
    // gekozen spot, de pijlen of een andere naam valt. Een thuisspot is een huisje.
    const inBeeld = ([x, y], marge) => x > vx + marge && x < vx + vw - marge && y > vy + marge && y < vy + vh - marge;
    const fs = compact ? 9 : 10;
    const tekstFill = `fill="${esc(theme.dark)}" fill-opacity="0.4" font-family="sans-serif"`;
    // Rond de gekozen spot staan de pijlen met hun waarden: daar geen namen.
    const rondSpot = (compact ? 60 : 85) / schaal;
    const bezet = [[0, 0]];
    for (const andere of spots) {
      const loc = andere.location;
      if (!loc || loc.lat == null || andere.id === spot.id) continue;
      const xy = p([loc.lon, loc.lat]);
      if (!inBeeld(xy, 12 / schaal)) continue;
      if (andere.id === homeSpotId) {
        const k = (13 / schaal) / 24;
        delen.push(`<path transform="translate(${(xy[0] - 12 * k).toFixed(3)} ${(xy[1] - 12 * k).toFixed(3)}) scale(${k.toFixed(5)})" d="${HUIS_PAD}" `
          + `fill="none" stroke="${esc(theme.dark)}" stroke-opacity="0.85" stroke-width="${(1.4 / schaal / k).toFixed(3)}" stroke-linejoin="round"/>`);
      } else {
        delen.push(`<circle cx="${xy[0].toFixed(2)}" cy="${xy[1].toFixed(2)}" r="${px(2.2)}" fill="${esc(theme.dark)}" fill-opacity="0.7"/>`);
      }
      const naam = andere.name ? esc(andere.name) : "";
      const breedte = (7 + naam.length * fs * 0.55) / schaal;
      // Telefoon: alleen in het middengebied (de grafiek); daarboven en -onder
      // staat tekst, daar blijft het bij stipjes.
      const hoogte = (xy[1] - vy) / vh;
      const vrij = (!compact || (hoogte > 0.3 && hoogte < 0.64))
        && Math.hypot(xy[0], xy[1]) > rondSpot
        && xy[0] + breedte < vx + vw - 4 / schaal
        && bezet.every(([bx, by]) => Math.abs(bx - xy[0]) > 90 / schaal || Math.abs(by - xy[1]) > 16 / schaal);
      if (naam && vrij) {
        bezet.push(xy);
        delen.push(`<text x="${(xy[0] + 7 / schaal).toFixed(2)}" y="${(xy[1] + (fs * 0.35) / schaal).toFixed(2)}" font-size="${px(fs)}" ${tekstFill}>${naam}</text>`);
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}">${delen.join("")}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [kust, druk, lat, lon, theme, w, h, omlaag, compact, spotsSig, homeSpotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pijlen = useMemo(() => meetPijlen(spot, moment), [spot, moment]);

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: -10 }}>
      {bron && <img key={spot?.id} src={bron} alt="" style={{ width: "100%", height: "100%", display: "block" }} decoding="async" />}
      {/* Vignet: midden blijft zo helder mogelijk, naar de rand toe loopt hij op
          naar de gewone paneelkleur, zodat tekst in header/sidebar/randen
          leesbaar blijft zonder dat elk venster zelf een dekkende achtergrond
          nodig heeft. */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 75% 70% at 50% 50%, transparent 0%, transparent 40%, ${theme.cream}73 72%, ${theme.cream}f0 100%)`,
      }} />
      {/* Spot, wind- en stroompijl met hun waarde. Een eigen laag boven de kaart:
          bij elk aangewezen punt in de grafiek verandert alleen dit, de kaart
          zelf hoeft niet opnieuw getekend. (0,0) = midden = de gekozen spot. */}
      {bron && w > 0 && (
        <svg viewBox={`${-w / 2} ${-h / 2 - h * omlaag} ${w} ${h}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {spot?.id && spot.id === homeSpotId ? (
            // Thuisspot: het huisje ís de markering, precies op de plek.
            <path transform={`scale(${(22 * sch) / 24}) translate(-12 -12.5)`} d={HUIS_PAD} fill="none"
              stroke={theme.orange} strokeWidth={2 * 24 / (22 * sch)} strokeLinejoin="round" />
          ) : (
            <>
              <circle r={8 * sch} fill="none" stroke={theme.orange} strokeWidth={2} />
              <circle r={3 * sch} fill={theme.orange} />
            </>
          )}
          {pijlen.wind && (
            <Pijl sch={sch} graden={(pijlen.wind.dir + 180) % 360} lengte={(34 + Math.min(pijlen.wind.ms * 1.943844, 35) * 1.4) * sch}
              kleur={theme.orange} halo={theme.cream} label={`${convertWind(pijlen.wind.ms, unit).toFixed(1)} ${unit}`} />
          )}
          {pijlen.stroom && (
            <Pijl sch={sch} graden={pijlen.stroom.dir} lengte={(26 + Math.min(pijlen.stroom.kts, 3) * 22) * sch}
              kleur={STROOM} halo={theme.cream} label={`${pijlen.stroom.kts.toFixed(1)} kts`} />
          )}
          {moment && <TijdLabel sch={sch} moment={moment} pijlen={pijlen} kleur={theme.dark} halo={theme.cream} />}
        </svg>
      )}
    </div>
  );
}

/* Wind en stroom voor de kaart: live, of op het moment dat in de windgrafiek is
   aangewezen. De marinereeks is drie-uurlijks: neem het dichtstbijzijnde punt,
   maar niet verder dan anderhalf uur weg. */
function meetPijlen(spot, moment) {
  const live = spot?.live || {};
  if (!moment) {
    return {
      wind: live.windDir != null && live.windSpeed != null ? { ms: live.windSpeed, dir: live.windDir } : null,
      stroom: live.currentDirection != null && live.currentSpeed ? { kts: live.currentSpeed, dir: live.currentDirection } : null,
    };
  }
  const ms = (p) => new Date(`${p.date}T${p.t}:00Z`).getTime();
  const doel = ms(moment);
  let m = null, beste = 90 * 60 * 1000;
  for (const p of spot?.marine ?? []) {
    const verschil = Math.abs(ms(p) - doel);
    if (verschil <= beste) { beste = verschil; m = p; }
  }
  const dir = moment.dir ?? live.windDir;
  return {
    wind: moment.v != null && dir != null ? { ms: moment.v, dir } : null,
    stroom: m?.currentDir != null && m?.currentSpeed ? { kts: m.currentSpeed, dir: m.currentDir } : null,
  };
}

/* Tijd van het aangewezen moment bij de spot, in de richting die het verst van
   beide pijlen af ligt (pijlen komen van buiten naar de spot toe). */
function TijdLabel({ moment, pijlen, kleur, halo, sch = 1 }) {
  const staarten = [];
  if (pijlen.wind) staarten.push(pijlen.wind.dir);              // windpijl komt uit de windrichting
  if (pijlen.stroom) staarten.push((pijlen.stroom.dir + 180) % 360);
  const afstand = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
  let hoek = 180, beste = -1;
  for (let h = 0; h < 360; h += 45) {
    const min = Math.min(360, ...staarten.map((t) => afstand(h, t)));
    if (min > beste) { beste = min; hoek = h; }
  }
  const r = (hoek * Math.PI) / 180, x = Math.sin(r) * 30 * sch, y = -Math.cos(r) * 30 * sch;
  const anker = Math.abs(x) < 10 ? "middle" : x < 0 ? "end" : "start";
  return (
    <text x={x} y={y} textAnchor={anker} dominantBaseline="middle" fontSize={sch < 1 ? 12 : 16} fontWeight={700}
      fill={kleur} stroke={halo} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
      {fmtMoment(moment)}
    </text>
  );
}

function fmtMoment(m) {
  const dag = new Date(`${m.date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${dag.charAt(0).toUpperCase() + dag.slice(1)} ${m.t}`;
}

/* Pijl die naar de spot toe wijst (graden = waar wind/stroom heen gaat, 0 = noord),
   met de waarde bij de staart. Dik en met een rand in achtergrondkleur: hij moet
   vanaf de bank te lezen zijn, ook waar hij over een kustlijn of isobaar valt. */
function Pijl({ graden, lengte, kleur, halo, label, sch = 1 }) {
  const r = (graden * Math.PI) / 180, dx = Math.sin(r), dy = -Math.cos(r);
  const begin = 13 * sch;
  const a = [-dx * (begin + lengte), -dy * (begin + lengte)];
  const b = [-dx * begin, -dy * begin];
  const punt = (hoek) => {
    const hh = r + Math.PI + hoek;
    return [b[0] + Math.sin(hh) * 14 * sch, b[1] - Math.cos(hh) * 14 * sch];
  };
  const [p1, p2] = [punt(0.5), punt(-0.5)];
  const d = `M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${p1[0]} ${p1[1]}L${b[0]} ${b[1]}L${p2[0]} ${p2[1]}`;
  // Label voorbij de staart, uitgelijnd van de spot af.
  const lx = -dx * (begin + lengte + 12 * sch), ly = -dy * (begin + lengte + 12 * sch);
  const anker = Math.abs(dx) < 0.35 ? "middle" : lx < 0 ? "end" : "start";
  const ty = anker === "middle" ? ly + (ly < 0 ? -4 : 12) : ly;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={halo} strokeOpacity={0.9} strokeWidth={8 * sch} />
      <path d={d} stroke={kleur} strokeWidth={4 * sch} />
      <text x={lx} y={ty} textAnchor={anker} dominantBaseline="middle" fontSize={sch < 1 ? 13 : 18} fontWeight={800}
        fill={kleur} stroke={halo} strokeWidth={sch < 1 ? 3 : 4} paintOrder="stroke">
        {label}
      </text>
    </g>
  );
}
