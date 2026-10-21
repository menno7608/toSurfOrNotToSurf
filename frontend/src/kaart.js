/* Rekenwerk voor de kaart achter de app: projectie rond de spot, isobaren
   uit het drukraster (marching squares + Chaikin) en hoge/lage druk. */

export const STRAAL_KM = 150;

/** Equirectangular rond de spot, in km; y omlaag zoals in SVG. */
export function projectie(lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]) => [(lon - lon0) * 111.32 * k, -(lat - lat0) * 111.32];
}

export const pad = (punten) => punten.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/** Het 9×9-raster bilineair verfijnen: gladdere isobaren dan op het ruwe raster. */
function verfijn(raster, lats, lons, factor = 4) {
  const n = raster.length, m = raster[0].length;
  const rijen = (n - 1) * factor + 1, kol = (m - 1) * factor + 1;
  const w = [], la = [], lo = [];
  for (let i = 0; i < rijen; i++) {
    const fi = i / factor, i0 = Math.min(Math.floor(fi), n - 2), ti = fi - i0;
    la.push(lats[i0] + (lats[i0 + 1] - lats[i0]) * ti);
    const rij = [];
    for (let j = 0; j < kol; j++) {
      const fj = j / factor, j0 = Math.min(Math.floor(fj), m - 2), tj = fj - j0;
      if (i === 0) lo.push(lons[j0] + (lons[j0 + 1] - lons[j0]) * tj);
      const a = raster[i0][j0], b = raster[i0][j0 + 1], c = raster[i0 + 1][j0], d = raster[i0 + 1][j0 + 1];
      rij.push(a * (1 - ti) * (1 - tj) + b * (1 - ti) * tj + c * ti * (1 - tj) + d * ti * tj);
    }
    w.push(rij);
  }
  return { w, la, lo };
}

/** Marching squares voor één niveau; geeft polylijnen in [lon, lat]. */
function contour(w, la, lo, niveau) {
  const segmenten = [];
  const op = (i1, j1, i2, j2) => {
    const a = w[i1][j1], b = w[i2][j2], t = (niveau - a) / (b - a);
    return [lo[j1] + (lo[j2] - lo[j1]) * t, la[i1] + (la[i2] - la[i1]) * t];
  };
  for (let i = 0; i < w.length - 1; i++) {
    for (let j = 0; j < w[0].length - 1; j++) {
      const c = (w[i][j] > niveau ? 8 : 0) | (w[i][j + 1] > niveau ? 4 : 0) | (w[i + 1][j + 1] > niveau ? 2 : 0) | (w[i + 1][j] > niveau ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const boven = () => op(i, j, i, j + 1), rechts = () => op(i, j + 1, i + 1, j + 1);
      const onder = () => op(i + 1, j, i + 1, j + 1), links = () => op(i, j, i + 1, j);
      const paren = {
        1: [[links, onder]], 2: [[onder, rechts]], 3: [[links, rechts]], 4: [[boven, rechts]],
        5: [[links, boven], [onder, rechts]], 6: [[boven, onder]], 7: [[links, boven]], 8: [[links, boven]],
        9: [[boven, onder]], 10: [[links, onder], [boven, rechts]], 11: [[boven, rechts]], 12: [[links, rechts]],
        13: [[onder, rechts]], 14: [[links, onder]],
      }[c];
      for (const [p, q] of paren) segmenten.push([p(), q()]);
    }
  }
  // Losse stukjes aan elkaar rijgen tot lijnen.
  const sleutel = ([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`;
  const bij = new Map();
  segmenten.forEach((s, n) => s.forEach((p) => {
    const k = sleutel(p);
    bij.set(k, [...(bij.get(k) || []), n]);
  }));
  const gebruikt = new Set();
  const lijnen = [];
  for (let n = 0; n < segmenten.length; n++) {
    if (gebruikt.has(n)) continue;
    gebruikt.add(n);
    const lijn = [...segmenten[n]];
    for (const kant of [1, 0]) {
      for (;;) {
        const eind = kant ? lijn[lijn.length - 1] : lijn[0];
        const volgende = (bij.get(sleutel(eind)) || []).find((x) => !gebruikt.has(x));
        if (volgende === undefined) break;
        gebruikt.add(volgende);
        const [a, b] = segmenten[volgende];
        const nieuw = sleutel(a) === sleutel(eind) ? b : a;
        if (kant) lijn.push(nieuw);
        else lijn.unshift(nieuw);
      }
    }
    lijnen.push(lijn);
  }
  return lijnen;
}

/** Chaikin: twee rondes hoeken afronden; eindpunten blijven staan. */
export function glad(lijn, rondes = 2) {
  let p = lijn;
  for (let r = 0; r < rondes; r++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1];
      q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Isobaren om de `stap` hPa, met waarde, plus hoge en lage druk. */
export function isobaren({ hpa, lats, lons }, stap = 2) {
  const { w, la, lo } = verfijn(hpa, lats, lons);
  const alle = hpa.flat();
  const min = Math.ceil(Math.min(...alle) / stap) * stap, max = Math.floor(Math.max(...alle) / stap) * stap;
  const lijnen = [];
  for (let v = min; v <= max; v += stap) {
    for (const l of contour(w, la, lo, v)) if (l.length > 3) lijnen.push({ hpa: v, punten: glad(l) });
  }
  // Hoog en laag: punten in het raster die hoger of lager zijn dan al hun buren.
  const centra = [];
  for (let i = 1; i < hpa.length - 1; i++) {
    for (let j = 1; j < hpa[0].length - 1; j++) {
      const v = hpa[i][j];
      const buren = [-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => (a || b ? hpa[i + a][j + b] : null))).filter((x) => x !== null);
      if (buren.every((b) => v > b)) centra.push({ soort: "H", hpa: v, punt: [lons[j], lats[i]] });
      if (buren.every((b) => v < b)) centra.push({ soort: "L", hpa: v, punt: [lons[j], lats[i]] });
    }
  }
  return { lijnen, centra };
}

/* Weer als kleine lijn-icoontjes (24×24), uit de WMO-weercode. */
const WOLK = "M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 11a3.5 3.5 0 0 0 0 7Z";
const WOLK_HOOG = "M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 7a3.5 3.5 0 0 0 0 7Z";
const WEER = {
  zon: ["M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"],
  maan: ["M19.5 14.5A8 8 0 1 1 9.5 4.5a6.2 6.2 0 0 0 10 10Z"],
  halfbewolkt: ["M8 3.5V5M3.5 8.5H5M4.8 4.8l1 1M11.2 4.8l-1 1", "M10.8 9.6A3.2 3.2 0 1 0 5.4 10",
    "M8.5 20h9a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 8.5 13.5a3.25 3.25 0 0 0 0 6.5Z"],
  bewolkt: [WOLK],
  regen: [WOLK_HOOG, "M9 17l-1 3M13 17l-1 3M17 17l-1 3"],
  onweer: [WOLK_HOOG, "M12.6 15.2 10.8 18.4h3l-1.8 3.2"],
  mist: ["M4 9h16M6 13h12M4 17h16"],
  sneeuw: [WOLK_HOOG, "M9 18h.01M13 18h.01M17 18h.01M11 21h.01M15 21h.01"],
};

export function weerIcoon(code, nacht = false) {
  if (code == null) return null;
  if (code >= 95) return WEER.onweer;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return WEER.sneeuw;
  if (code >= 51) return WEER.regen;
  if (code === 45 || code === 48) return WEER.mist;
  if (code === 3) return WEER.bewolkt;
  if (code === 2) return nacht ? WEER.bewolkt : WEER.halfbewolkt;
  return nacht ? WEER.maan : WEER.zon;
}
