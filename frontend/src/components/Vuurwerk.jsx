import { useMemo } from "react";

/* Lijnvuurwerk in de stijl van de app: dunne, ronde lijnen in blauw (zelfde
   tint als de alarmgloed), oranje (de windstoot-kleur) en de neutrale
   kustlijnkleur. Geen vlakken of confetti.

   Een salvo duurt ± 3,5 s en komt in het midden van de grafiek uit:
     0,00 s  een dunne stijgstreep met lichtpuntje schiet van de dagkaart
             omhoog naar het midden van de grafiek
     0,75 s  hoofdknal: lichtflits met gloed, twee schokgolf-ringen, twintig
             stralen (lang en kort) met vorkjes aan de punten, vallende
             vonken, glittertjes en twinkelende sterretjes
     1,10 s  een tweede, kleinere knal links
     1,30 s  een derde, nog kleinere knal rechts
   Alles is SVG + CSS-animatie; bij `prefers-reduced-motion` wordt er geen
   salvo getoond (zie WeekForecast). */

// Palet: goud, teal, koraal en hemelsblauw — warm genoeg voor vuurwerk, maar
// zo gedempt dat het bij de zeekaart past. Neutrale details gebruiken de
// kustlijnkleur van het thema.
const GOUD = "#f0c75e", TEAL = "#4fd1c5", KORAAL = "#f2766b", HEMEL = "#7cc4f0";
const VIOLET = "#b794f6", MINT = "#7ee8a8", ROOS = "#f59ac0";
const PALET = [GOUD, TEAL, KORAAL, HEMEL];
// Elke knal heeft een eigen palet, zodat het salvo niet uit één kleurschema bestaat.
const PALETTEN = [PALET, [VIOLET, MINT, HEMEL, ROOS], [KORAAL, GOUD, ROOS, TEAL]];

function mix(a, b, t) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [h(a), h(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export const KNAL = 0.75; // seconden tot de hoofdknal
const GROOT = 1.35; // schaal van de knallen (de stijgstreep blijft zoals hij is)

// `--vw-tempo` staat op de svg-root van elk salvo (zie Vuurwerk): alle duren
// hieronder lopen via calc(), zodat één svg-brede variabele de hele show
// vertraagt — bij drukke keyframes als .vw-straal gaat alleen de animatie
// langzamer, niet de onderlinge vertraging (die zet elk element zelf in de
// stijl, al vermenigvuldigd met `duur`, zie de componenten hieronder).
export const VUURWERK_CSS = `
.vw-spoor{stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation-name:vw-spoor;animation-duration:calc(.75s * var(--vw-tempo, 1));animation-timing-function:cubic-bezier(.25,.6,.35,1);animation-fill-mode:both}
@keyframes vw-spoor{0%{stroke-dashoffset:1;opacity:0}12%{opacity:.9}85%{stroke-dashoffset:0;opacity:.9}100%{stroke-dashoffset:0;opacity:0}}
.vw-straal{stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation-name:vw-straal;animation-duration:calc(1.8s * var(--vw-tempo, 1));animation-timing-function:cubic-bezier(.2,.7,.3,1);animation-fill-mode:both}
@keyframes vw-straal{0%{stroke-dashoffset:1;opacity:0}8%{opacity:1}42%{stroke-dashoffset:0;opacity:.95}100%{stroke-dashoffset:-1;opacity:0}}
.vw-vonk{opacity:0;animation-name:vw-vonk;animation-duration:calc(2s * var(--vw-tempo, 1));animation-timing-function:cubic-bezier(.25,.6,.4,1);animation-fill-mode:both}
@keyframes vw-vonk{0%{transform:translate(0,0);opacity:0}12%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
.vw-ring{opacity:0;animation-name:vw-ring;animation-duration:calc(1.3s * var(--vw-tempo, 1));animation-timing-function:ease-out;animation-fill-mode:both}
@keyframes vw-ring{0%{transform:scale(.15);opacity:.85}100%{transform:scale(1);opacity:0}}
.vw-flits{opacity:0;animation-name:vw-flits;animation-duration:calc(.6s * var(--vw-tempo, 1));animation-timing-function:ease-out;animation-fill-mode:both}
@keyframes vw-flits{0%{transform:scale(.3);opacity:1}100%{transform:scale(2.4);opacity:0}}
.vw-ster{opacity:0;animation-name:vw-ster;animation-duration:calc(1.2s * var(--vw-tempo, 1));animation-timing-function:ease-in-out;animation-fill-mode:both}
@keyframes vw-ster{0%{transform:translate(var(--x),var(--y)) scale(0);opacity:0}45%{transform:translate(var(--x),var(--y)) scale(var(--s));opacity:1}100%{transform:translate(var(--x),var(--y)) scale(0);opacity:0}}
.vw-droop{stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation-name:vw-droop;animation-duration:calc(2.2s * var(--vw-tempo, 1));animation-timing-function:cubic-bezier(.3,.5,.5,1);animation-fill-mode:both}
@keyframes vw-droop{0%{stroke-dashoffset:1;opacity:0}15%{opacity:.9}60%{stroke-dashoffset:0;opacity:.75}100%{stroke-dashoffset:0;opacity:0}}
.vw-tornado{opacity:0;animation-name:vw-tornado;animation-duration:calc(3.8s * var(--vw-tempo, 1));animation-timing-function:cubic-bezier(.4,.1,.5,1);animation-fill-mode:both}
@keyframes vw-tornado{0%{transform:translate(var(--x0),var(--y0)) scale(var(--sc));opacity:0}14%{opacity:1}80%{opacity:1}100%{transform:translate(var(--x1),var(--y1)) scale(var(--sc));opacity:0}}
.vw-wieg{transform-box:fill-box;transform-origin:50% 100%;animation-name:vw-wieg;animation-duration:calc(1.3s * var(--vw-tempo, 1));animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes vw-wieg{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}
.vw-rij{animation-name:vw-rij;animation-duration:calc(.55s * var(--vw-tempo, 1));animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes vw-rij{from{transform:translateX(calc(var(--a) * -1))}to{transform:translateX(var(--a))}}
@media (prefers-reduced-motion: reduce){.vw-spoor,.vw-straal,.vw-vonk,.vw-ring,.vw-flits,.vw-ster,.vw-droop,.vw-tornado,.vw-wieg,.vw-rij{animation:none;opacity:0}}`;

function pseudo(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const STER = "M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2Z";

/* Eén knal, getekend rond (0,0) in een eigen groep. `b` = vertraging (s) tot de knal. */
function Knal({ seed, b, oranje, neutraal, palet = PALET, duur = 1 }) {
  const d = useMemo(() => {
    const r = pseudo(seed);
    const rot = r() * (Math.PI / 10);
    const stralen = Array.from({ length: 20 }, (_, i) => {
      const a = rot + (i / 20) * Math.PI * 2;
      const lang = i % 2 === 0;
      const len = (lang ? 74 : 48) * (0.92 + r() * 0.16);
      const w = 0.85 + r() * 0.4; // diktefactor per straal
      return { c: Math.cos(a), s: Math.sin(a), a, lang, len, w, kleur: lang ? palet[(i / 2) % palet.length] : neutraal, kleur2: lang ? palet[(i / 2 + 1) % palet.length] : neutraal };
    });
    // Vorkjes: twee takjes aan de punt van elke lange straal (chrysantheem).
    const vorken = stralen.filter((x) => x.lang).flatMap((x, i) => [-0.5, 0.5].map((h) => ({
      x1: x.c * x.len, y1: x.s * x.len,
      x2: x.c * x.len + Math.cos(x.a + h) * 13, y2: x.s * x.len + Math.sin(x.a + h) * 13,
      kleur: x.kleur2, vertraging: b + duur * (0.32 + (i % 3) * 0.03),
    })));
    // Treurwilg: gouden strepen die vanaf de punten van de gouden stralen naar beneden hangen.
    const droops = stralen.filter((x) => x.lang && x.kleur === palet[0]).flatMap((x, i) => [0, 1].map((k) => {
      const tx = x.c * x.len, ty = x.s * x.len, o = k * 3.5;
      return { d: `M${tx + o} ${ty} Q ${tx + x.c * 22 + o} ${ty + x.s * 10 + 6}, ${tx + x.c * 18 + o * 1.6} ${ty + x.s * 18 + 46 + k * 8}`,
        vertraging: b + duur * (0.42 + i * 0.05 + k * 0.08) };
    }));
    // Vonken vallen vanaf de punten van de lange stralen, glitters vanaf de korte.
    const vonken = stralen.map((x, i) => ({
      x: x.c * (x.len + 5), y: x.s * (x.len + 5),
      dx: x.c * (x.lang ? 16 : 8), dy: x.s * (x.lang ? 16 : 8) + (x.lang ? 28 : 16) + r() * 14,
      r: x.lang ? 2 : 1.2, kleur: x.kleur2, vertraging: b + duur * (0.25 + (i % 4) * 0.04),
    }));
    const sterren = Array.from({ length: 10 }, () => {
      const a = r() * Math.PI * 2, rr = 22 + r() * 56;
      return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: 0.6 + r() * 0.7, vertraging: b + duur * (0.2 + r() * 1.0) };
    });
    return { stralen, vorken, droops, vonken, sterren };
  }, [seed, b, oranje, neutraal, palet, duur]);

  const gid = `vwg${seed}`;
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor={palet[0]} stopOpacity="0.34" />
          <stop offset="100%" stopColor={palet[0]} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`vwh${seed}`}>
          <stop offset="0%" stopColor={neutraal} stopOpacity="0.8" />
          <stop offset="100%" stopColor={neutraal} stopOpacity="0" />
        </radialGradient>
        {d.stralen.map((x, i) => x.lang && (
          <linearGradient key={`g${i}`} id={`vwr${seed}-${i}`} gradientUnits="userSpaceOnUse"
            x1={x.c * 13} y1={x.s * 13} x2={x.c * x.len} y2={x.s * x.len}>
            <stop offset="0%" stopColor={mix(x.kleur, "#ffffff", 0.6)} />
            <stop offset="50%" stopColor={x.kleur} />
            <stop offset="100%" stopColor={x.kleur2} />
          </linearGradient>
        ))}
      </defs>
      <circle className="vw-flits" r="34" fill={`url(#${gid})`} style={{ animationDelay: `${b}s`, animationDuration: `${1.2 * duur}s` }} />
      <circle className="vw-flits" r="6" fill={mix(palet[0], "#ffffff", 0.5)} style={{ animationDelay: `${b}s` }} />
      <circle className="vw-ring" r="56" fill="none" stroke={neutraal} strokeWidth="1.8" style={{ animationDelay: `${b}s` }} />
      <circle className="vw-ring" r="76" fill="none" stroke={TEAL} strokeWidth="1.6" strokeDasharray="1 5.5"
        style={{ animationDelay: `${b + duur * 0.12}s`, animationDuration: `${1.6 * duur}s` }} />
      {/* Geen SVG-`<filter>` ergens in dit salvo (geen slagschaduw, geen gloed-
          blur): elke combinatie die we probeerden — feDropShadow op een
          dash-geanimeerde lijn, feGaussianBlur op de vonken/sterren, blur op
          de kleine knallen erachter — liet Chromium op een willekeurig moment
          een dicht zwart blok tekenen in plaats van de inhoud, groter
          naarmate het salvo groter stond (dus ook in een gewoon venster, geen
          headless-only ding). Diepte komt nu van kleurverloop, gelaagde
          cirkels en doorzichtigheid, nooit van een filter. */}
      <g>
      {d.stralen.flatMap((x, i) => (x.lang ? [[0.38, 2.2], [0.7, 1.5], [1, 0.9]] : [[0.5, 1.5], [1, 0.7]]).map(([f, w], j) => (
        <line key={`${i}-${j}`} className="vw-straal" pathLength="1"
          x1={x.c * 13} y1={x.s * 13} x2={x.c * (13 + (x.len - 13) * f)} y2={x.s * (13 + (x.len - 13) * f)}
          stroke={x.lang ? `url(#vwr${seed}-${i})` : x.kleur} strokeWidth={w * x.w} strokeLinecap="round"
          style={{ animationDelay: `${b + duur * (i % 2) * 0.05}s` }} />
      )))}
      {d.vorken.map((v, i) => (
        <line key={`v${i}`} className="vw-straal" pathLength="1" x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}
          stroke={v.kleur} strokeWidth="1.3" strokeLinecap="round"
          style={{ animationDelay: `${v.vertraging}s`, animationDuration: `${1.5 * duur}s` }} />
      ))}
      {d.droops.map((w, i) => (
        <path key={`d${i}`} className="vw-droop" pathLength="1" d={w.d} fill="none" stroke={palet[0]}
          strokeWidth={i % 2 ? 0.8 : 1.9} strokeLinecap="round" style={{ animationDelay: `${w.vertraging}s` }} />
      ))}
      </g>
      <g>
      {d.vonken.map((v, i) => (
        <circle key={i} className="vw-vonk" cx={v.x} cy={v.y} r={v.r * 2.2} fill={`url(#vwh${seed})`}
          style={{ "--dx": `${v.dx}px`, "--dy": `${v.dy}px`, animationDelay: `${v.vertraging}s` }} />
      ))}
      {d.vonken.map((v, i) => (
        <circle key={`k${i}`} className="vw-vonk" cx={v.x} cy={v.y} r={v.r} fill={v.kleur}
          style={{ "--dx": `${v.dx}px`, "--dy": `${v.dy}px`, animationDelay: `${v.vertraging}s` }} />
      ))}
      {d.sterren.map((s, i) => (
        <path key={i} className="vw-ster" d={STER} fill={palet[i % palet.length]}
          style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--s": s.s, animationDelay: `${s.vertraging}s` }} />
      ))}
      </g>
    </g>
  );
}

/* Tornadootje: een trechter van dunne, schuin lopende bogen die elk heen en weer
   schuiven (zo draait hij), met een wiegende punt en stofdeeltjes die rond de
   bovenrand cirkelen. Zweeft in ruim 3,5 s van (x0,y0) naar (x1,y1) en dooft uit. */
function Tornado({ x0, y0, x1, y1, sc = 1, vertraging = 0, kleur, neutraal, seed = 1, duur = 1 }) {
  const rijen = Array.from({ length: 9 }, (_, k) => {
    const w = 17 * Math.pow(1 - k / 9.5, 0.95) + 1.5;
    const y = -26 + k * 6.6;
    return { w, y, a: 1.2 + (8 - k) * 0.42, kleur: mix(kleur, GOUD, k / 9), dik: 1.7 - k * 0.16, vertraging: -(k * 0.07) * duur };
  });
  const baan = "M -19 -26 a19 4.2 0 1 0 38 0 a19 4.2 0 1 0 -38 0";
  const gid = `vwt${seed}`;
  return (
    <g className="vw-tornado" style={{ "--x0": `${x0}px`, "--y0": `${y0}px`, "--x1": `${x1}px`, "--y1": `${y1}px`, "--sc": sc, animationDelay: `${vertraging}s` }}>
      <defs>
        {/* Zachte grondschaduw via kleurverloop: geen `<filter>` — die blies
            dit tornadootje soms op tot een zwart blok, zie Knal hierboven. */}
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#04101a" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#04101a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#04101a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="37" rx="19" ry="5.5" fill={`url(#${gid})`} />
      <g className="vw-wieg">
        <path d="M -18 -26 C -14 -6, -6 14, -1.5 33 M 18 -26 C 14 -6, 6 14, 1.5 33" fill="none" stroke={neutraal} strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
        {rijen.map((r, i) => (
          <g key={i} className="vw-rij" style={{ "--a": `${r.a}px`, animationDelay: `${r.vertraging}s` }}>
            <path d={`M ${-r.w} ${r.y} Q 0 ${r.y - 3.4}, ${r.w} ${r.y}`} fill="none" stroke={r.kleur} strokeOpacity="0.28" strokeWidth={0.5 + r.dik * 0.25} strokeLinecap="round" />
            <path d={`M ${-r.w} ${r.y} Q 0 ${r.y + 3.4}, ${r.w} ${r.y}`} fill="none" stroke={r.kleur} strokeOpacity="0.95" strokeWidth={0.8 + r.dik * 0.8} strokeLinecap="round" />
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <circle key={i} r="1.5" fill={i === 1 ? GOUD : kleur} opacity="0.95">
            <animateMotion dur={`${1.05 * duur}s`} begin={`${-i * 0.35 * duur}s`} repeatCount="indefinite" path={baan} />
          </circle>
        ))}
      </g>
    </g>
  );
}

/* Een salvo: stijgstreep van `van` ({dx, dy}: de dagkaart, relatief aan het
   midden) naar het midden (0,0), daar de hoofdknal en twee kleinere knallen.

   `schaal` vergroot het hele salvo (knallen, tornado's, stralen) zonder dat
   het de echte schermpositie van de dagkaart (`van`) verlegt: de viewBox
   blijft vast op 460×460 terwijl de weergegeven grootte meeschaalt — één
   viewBox-eenheid is dan `schaal` CSS-pixels, dus `van` wordt door `schaal`
   gedeeld om op dezelfde plek op het scherm uit te komen. Op de telefoon
   blijft `schaal` 1 (zoals voorheen); op het wandscherm groeit het salvo mee
   met de breedte van de grafiek erboven. */
export function Vuurwerk({ seed = 1, oranje, neutraal, van = { dx: 0, dy: 160 }, schaal = 1, duur = 1 }) {
  const K = KNAL * duur; // tijd tot de hoofdknal, geschaald met de ingestelde snelheid
  const vdx = van.dx / schaal, vdy = van.dy / schaal;
  const pad = `M${vdx} ${vdy} C ${vdx * 0.85} ${vdy * 0.5}, ${vdx * 0.15} ${vdy * 0.25}, 0 8`;
  return (
    <svg viewBox="-230 -230 460 460" width={460 * schaal} height={460 * schaal} aria-hidden="true"
      style={{ position: "absolute", left: -230 * schaal, top: -230 * schaal, overflow: "visible", pointerEvents: "none", "--vw-tempo": duur }}>
      <path className="vw-spoor" pathLength="1" d={pad} fill="none" stroke={GOUD} strokeWidth="4.5" strokeOpacity="0.2" strokeLinecap="round" />
      <path className="vw-spoor" pathLength="1" d={pad} fill="none" stroke={mix(GOUD, "#ffffff", 0.5)} strokeWidth="1.3" strokeLinecap="round" />
      <circle r="2.4" fill={GOUD} opacity="0">
        <animateMotion dur={`${K}s`} path={pad} fill="freeze" calcMode="spline" keySplines=".25 .6 .35 1" keyTimes="0;1" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.9;1" dur={`${K + 0.03 * duur}s`} fill="freeze" />
      </circle>
      <g transform={`scale(${GROOT})`}>
        <g transform="translate(-92 -54) scale(.52)" opacity="0.65"><Knal seed={seed + 11} b={K + 0.35 * duur} oranje={oranje} neutraal={neutraal} palet={PALETTEN[1]} duur={duur} /></g>
        <g transform="translate(98 -38) scale(.42)" opacity="0.5"><Knal seed={seed + 23} b={K + 0.55 * duur} oranje={oranje} neutraal={neutraal} palet={PALETTEN[2]} duur={duur} /></g>
        <Knal seed={seed} b={K} oranje={oranje} neutraal={neutraal} duur={duur} />
      </g>
      <Tornado x0={-175} y0={46} x1={-62} y1={70} sc={0.95} vertraging={K + 0.1 * duur} kleur={HEMEL} neutraal={neutraal} seed={seed} duur={duur} />
      <Tornado x0={180} y0={30} x1={70} y1={64} sc={1.1} vertraging={K + 0.55 * duur} kleur={TEAL} neutraal={neutraal} seed={seed + 1} duur={duur} />
      <Tornado x0={-20} y0={84} x1={36} y1={90} sc={0.6} vertraging={K + 1.0 * duur} kleur={KORAAL} neutraal={neutraal} seed={seed + 2} duur={duur} />
    </svg>
  );
}

/* Blijvend klein vuurwerk-icoontje op de dagkaart van een passende dag. */
export function VuurwerkIcoon({ size = 16, oranje }) {
  return (
    <svg viewBox="-10 -10 20 20" width={size} height={size} aria-hidden="true" style={{ pointerEvents: "none" }}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const lang = i % 2 === 0;
        const l = lang ? 8.5 : 5.8;
        return (
          <line key={i} x1={Math.cos(a) * 2.6} y1={Math.sin(a) * 2.6} x2={Math.cos(a) * l} y2={Math.sin(a) * l}
            stroke={lang ? GOUD : TEAL} strokeWidth={lang ? 1.3 : 1} strokeLinecap="round" />
        );
      })}
      <circle r="1.3" fill={KORAAL} />
    </svg>
  );
}
