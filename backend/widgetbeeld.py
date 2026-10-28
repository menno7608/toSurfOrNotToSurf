"""Tekent de widget als afbeelding, op de server.

Waarom op de server: dan krijgen Android en iPhone dezelfde widget, en een verbetering
aan het ontwerp hoeft niet per telefoon geïnstalleerd te worden. De telefoon haalt alleen
een PNG op en toont die.

Alle maten hieronder zijn 'logische pixels' voor een beeld van 640 breed; het echte beeld
wordt daarvan afgeleid (en intern dubbel zo groot getekend voor gladde randen).
Pillow wordt pas bij gebruik geladen, zodat de rest van de app ook zonder Pillow draait.
"""
import json
import math
import os
from datetime import datetime, timezone

_FONT_DIR = "/usr/share/fonts/truetype/dejavu/"

LICHT = dict(
    bg=(240, 235, 224), tekst=(45, 63, 74), zwak=(92, 111, 123), raster=(122, 157, 176, 51),
    lijn=(122, 157, 176), voor=(61, 127, 168), vlaag=(192, 122, 58), accent=(224, 123, 58),
)
DONKER = dict(
    bg=(26, 38, 53), tekst=(200, 192, 176), zwak=(154, 163, 172), raster=(122, 157, 176, 51),
    lijn=(122, 157, 176), voor=(96, 184, 232), vlaag=(212, 136, 64), accent=(232, 145, 62),
)
PIL_KLEUREN = {"go": (46, 204, 113), "bijna": (245, 166, 35), "nee": (138, 150, 163)}
DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]
PIJLEN = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]
UREN = 24
SOORTEN = ("wind", "regen", "golven", "getij", "stroom")
NAMEN = {"wind": "Wind", "regen": "Regen", "golven": "Golven", "getij": "Getij", "stroom": "Stroming"}
EENHEID = {"wind": "kn", "regen": "mm", "golven": "m", "getij": "m", "stroom": "kn"}


def beschikbaar():
    try:
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False


def _pil():
    from PIL import Image, ImageDraw, ImageFont
    return Image, ImageDraw, ImageFont


def _kleuren(thema):
    return DONKER if thema == "donker" else LICHT


def _a(kleur, alpha):
    return tuple(kleur[:3]) + (int(alpha),)


class Doek:
    """Een transparant beeld met logische coördinaten (640 breed) en alpha-mengen per laag."""

    SS = 2  # supersampling

    def __init__(self, breedte, hoogte):
        Image, ImageDraw, ImageFont = _pil()
        self.Image, self.ImageDraw, self.ImageFont = Image, ImageDraw, ImageFont
        self.W, self.H = breedte, hoogte
        self.f = breedte / 640.0 * self.SS           # logische px -> echte px (dubbel)
        self.img = Image.new("RGBA", (int(breedte * self.SS), int(hoogte * self.SS)), (0, 0, 0, 0))
        self._fonts = {}

    def font(self, maat, vet=False):
        sleutel = (round(maat * self.f), vet)
        if sleutel not in self._fonts:
            pad = _FONT_DIR + ("DejaVuSans-Bold.ttf" if vet else "DejaVuSans.ttf")
            self._fonts[sleutel] = self.ImageFont.truetype(pad, max(6, sleutel[0]))
        return self._fonts[sleutel]

    def laag(self):
        l = self.Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        return l, self.ImageDraw.Draw(l)

    def mengen(self, l):
        self.img = self.Image.alpha_composite(self.img, l)

    def px(self, v):
        return v * self.f

    def tekst(self, d, x, y, s, maat, kleur, vet=False, uitlijning="l"):
        """y = basislijn in logische px."""
        font = self.font(maat, vet)
        breedte = d.textlength(s, font=font)
        X = self.px(x) - (breedte if uitlijning == "r" else breedte / 2 if uitlijning == "m" else 0)
        d.text((X, self.px(y)), s, font=font, fill=kleur, anchor="ls")

    def meet(self, s, maat, vet=False):
        d = self.ImageDraw.Draw(self.img)
        return d.textlength(s, font=self.font(maat, vet)) / self.f

    def klaar(self):
        return self.img.resize((int(self.W), int(self.H)), self.Image.LANCZOS)


def _epoch(t):
    return int(datetime.fromisoformat(t).replace(tzinfo=timezone.utc).timestamp())


def _dag(t):
    return DAGEN[int(((t // 86400) + 3) % 7)]


def _mooie_stap(bereik):
    for o in (0.1, 0.2, 0.5, 1, 2, 5, 10, 20):
        if bereik / o <= 4:
            return o
    return 50


def _label(v, stap):
    return f"{v:.1f}" if stap < 1 else str(int(round(v)))


def _waarde_op(x, y, t):
    for i in range(1, len(x)):
        if x[i - 1] <= t <= x[i]:
            if y[i] is None or y[i - 1] is None:
                return None
            f = 0 if x[i] == x[i - 1] else (t - x[i - 1]) / (x[i] - x[i - 1])
            return y[i - 1] + (y[i] - y[i - 1]) * f
    return None


def heeft(reeksen, soort):
    sleutel = {"wind": "wind", "regen": "regen", "golven": "golven", "getij": "getij", "stroom": "stroom"}[soort]
    return len(reeksen.get(sleutel) or []) > 1


# ------------------------------------------------------------------ grafiek

def teken_grafiek(doek, reeksen, soort, offset_uren, thema, oy=0, hoogte=None):
    """Tekent de grafiek in `doek` (alleen het gedeelte vanaf oy, `hoogte` logische px hoog)."""
    k = _kleuren(thema)
    B = 640.0
    H = hoogte if hoogte is not None else doek.H * 640.0 / doek.W
    LINKS, RECHTS, BOVEN, UURLABELS, STROOK = 44, 10, 22, 22, 42
    pts = reeksen[soort if soort != "regen" else "regen"]
    n = len(pts)
    if n < 2:
        return
    veld = {"wind": "kn", "regen": "mm", "golven": "hs", "getij": "m", "stroom": "kn"}[soort]
    x = [_epoch(p["t"]) for p in pts]
    y = [p.get(veld) for p in pts]
    g = [p.get("gust") if soort == "wind" else None for p in pts]
    x0, x1 = x[0], x[-1]
    nu = _epoch(reeksen["nowAt"])
    ws = nu - (UREN // 2) * 3600 + offset_uren * 3600
    ws = max(x0, min(ws, x1 - UREN * 3600))
    we = ws + UREN * 3600

    waarden = [v for t, v in zip(x, y) if v is not None and ws - 3600 <= t <= we + 3600]
    waarden += [v for t, v in zip(x, g) if v is not None and ws - 3600 <= t <= we + 3600]
    lo, hi = 0.0, max(waarden + [0.0])
    lo = min([0.0] + [v for v in waarden if v is not None])
    stap = _mooie_stap(hi - lo)
    hi = math.ceil(hi / stap) * stap
    lo = math.floor(lo / stap) * stap
    if hi - lo < stap:
        hi = lo + stap

    vl = (LINKS, oy + BOVEN, B - RECHTS, oy + H - STROOK - UURLABELS)  # links, boven, rechts, onder

    def X(t):
        return vl[0] + (t - ws) / (we - ws) * (vl[2] - vl[0])

    def Y(v):
        return vl[3] - (v - lo) / (hi - lo) * (vl[3] - vl[1])

    p = doek.px
    # raster + as-labels
    l, d = doek.laag()
    v = lo
    while v <= hi + 1e-9:
        d.line([p(vl[0]), p(Y(v)), p(vl[2]), p(Y(v))], fill=k["raster"], width=max(1, int(p(1))))
        doek.tekst(d, vl[0] - 6, Y(v) + 7, _label(v, stap), 20, _a(k["zwak"], 255), uitlijning="r")
        v += stap
    t = ((ws + 3 * 3600 - 1) // (3 * 3600)) * (3 * 3600)
    while t <= we:
        d.line([p(X(t)), p(vl[1]), p(X(t)), p(vl[3])], fill=k["raster"], width=max(1, int(p(1))))
        uur = (t // 3600) % 24
        doek.tekst(d, X(t), vl[3] + 22, _dag(t) if uur == 0 else f"{uur:02d}", 20, _a(k["zwak"], 255), uitlijning="m")
        t += 3 * 3600
    doek.mengen(l)

    # reeks, geknipt op het venster (we tekenen op een laag en knippen met een masker)
    l, d = doek.laag()
    nu_x = X(max(ws, min(nu, we)))

    def lijn(vals, kleur, streep, dikte, van=None, tot=None):
        segment, open_ = [], False
        lijnen = []
        for tt, vv in zip(x, vals):
            if vv is None:
                open_ = False
                continue
            pt = (p(X(tt)), p(Y(vv)))
            if van is not None and tt < van:
                continue
            if tot is not None and tt > tot:
                continue
            if open_:
                lijnen[-1].append(pt)
            else:
                lijnen.append([pt])
            open_ = True
        for stuk in lijnen:
            if len(stuk) < 2:
                continue
            if streep:
                _streep(d, stuk, kleur, p(dikte), p(8), p(6))
            else:
                d.line(stuk, fill=kleur, width=int(p(dikte)), joint="curve")

    if soort == "regen":
        bw = max(3.0, (vl[2] - vl[0]) / UREN * 0.8)
        for tt, vv in zip(x, y):
            if vv is None or vv <= 0 or not ws <= tt <= we:
                continue
            d.rectangle([p(X(tt) - bw / 2), p(Y(vv)), p(X(tt) + bw / 2), p(Y(0))], fill=_a(k["voor"], 255))
    else:
        if soort == "wind":
            lijn(g, _a(k["vlaag"], 255), True, 2.5)
        lijn(y, _a(k["lijn"], 255), False, 3.5, tot=nu)
        lijn(y, _a(k["voor"], 255), soort == "wind", 3.5, van=nu)
    # knippen op het plotvak
    masker = doek.Image.new("L", l.size, 0)
    doek.ImageDraw.Draw(masker).rectangle([p(vl[0]), p(vl[1] - 2), p(vl[2]), p(vl[3] + 2)], fill=255)
    l.putalpha(doek.Image.composite(l.getchannel("A"), doek.Image.new("L", l.size, 0), masker))
    doek.mengen(l)

    # windrichting onderin de plot
    if soort == "wind":
        l, d = doek.laag()
        for tt, pt in zip(x, pts):
            if pt.get("dir") is None or not ws <= tt <= we or (tt // 3600) % 3 != 0:
                continue
            doek.tekst(d, X(tt), vl[3] - 6, PIJLEN[int(round(pt["dir"] / 45.0)) % 8], 20, _a(k["zwak"], 179), uitlijning="m")
        doek.mengen(l)

    # titel + legenda
    l, d = doek.laag()
    titel = f"{NAMEN[soort]} · {EENHEID[soort]} · 24 uur"
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):  # rand in achtergrondkleur
        doek.tekst(d, vl[0] + 8 + dx, vl[1] + 20 + dy, titel, 20, _a(k["bg"], 220), vet=True)
    doek.tekst(d, vl[0] + 8, vl[1] + 20, titel, 20, _a(k["tekst"], 230), vet=True)
    if soort == "wind":
        rx, ly = vl[2] - 6, vl[1] + 17
        w1 = doek.meet("vlagen", 16)
        doek.tekst(d, rx, ly, "vlagen", 16, _a(k["zwak"], 255), uitlijning="r")
        _streep(d, [(p(rx - w1 - 30), p(ly - 5)), (p(rx - w1 - 8), p(ly - 5))], _a(k["vlaag"], 255), p(2.5), p(5), p(4))
        rx2 = rx - w1 - 40
        w2 = doek.meet("gemiddeld", 16)
        doek.tekst(d, rx2, ly, "gemiddeld", 16, _a(k["zwak"], 255), uitlijning="r")
        d.line([p(rx2 - w2 - 30), p(ly - 5), p(rx2 - w2 - 8), p(ly - 5)], fill=_a(k["voor"], 255), width=int(p(3)))
    doek.mengen(l)

    # nu: stippellijn en oranje punt
    if ws <= nu <= we:
        l, d = doek.laag()
        _streep(d, [(p(nu_x), p(vl[1])), (p(nu_x), p(vl[3]))], _a(k["accent"], 136), p(1.5), p(6), p(6))
        wn = _waarde_op(x, y, nu)
        if wn is not None and soort != "regen":
            cy = p(Y(wn))
            d.ellipse([p(nu_x) - p(10), cy - p(10), p(nu_x) + p(10), cy + p(10)], fill=_a(k["bg"], 235))
            d.ellipse([p(nu_x) - p(7), cy - p(7), p(nu_x) + p(7), cy + p(7)], fill=_a(k["accent"], 255))
        doek.mengen(l)

    # tikpijltjes
    l, d = doek.laag()
    midden = (vl[1] + vl[3]) / 2 + 12
    if ws > x0:
        doek.tekst(d, vl[0] + 14, midden, "‹", 40, _a(k["zwak"], 102), uitlijning="m")
    if we < x1:
        doek.tekst(d, vl[2] - 14, midden, "›", 40, _a(k["zwak"], 102), uitlijning="m")
    doek.mengen(l)

    # weekstrook
    sv = (vl[0], oy + H - STROOK + 4, vl[2], oy + H - 17)
    sx0, sx1 = x0, x1

    def SX(t):
        return sv[0] + (t - sx0) / (sx1 - sx0) * (sv[2] - sv[0])

    vals = [v for v in y if v is not None]
    slo, shi = min([0.0] + vals), max(vals + [0.0])
    if shi - slo < 1e-6:
        shi = slo + 1
    l, d = doek.laag()
    dag = 86400
    m = ((sx0 // dag) + 1) * dag
    while m < sx1:
        d.line([p(SX(m)), p(sv[1]), p(SX(m)), p(sv[3])], fill=k["raster"], width=max(1, int(p(1))))
        m += dag
    m = (sx0 // dag) * dag
    while m < sx1:
        a_, b_ = max(m, sx0), min(m + dag, sx1)
        if b_ - a_ >= 8 * 3600:
            doek.tekst(d, SX(a_ + (b_ - a_) / 2), oy + H - 3, _dag(m), 18, _a(k["zwak"], 217), uitlijning="m")
        m += dag
    v0, v1 = SX(max(ws, sx0)), SX(min(we, sx1))
    d.rounded_rectangle([p(v0), p(sv[1] - 4), p(v1), p(sv[3] + 4)], radius=int(p(6)),
                        fill=_a(k["accent"], 46), outline=_a(k["accent"], 153), width=max(1, int(p(1.5))))
    punten = []
    for tt, vv in zip(x, y):
        if vv is None:
            continue
        px_, py_ = p(SX(tt)), p(sv[3] - (vv - slo) / (shi - slo) * (sv[3] - sv[1]))
        if soort == "regen":
            d.line([px_, p(sv[3]), px_, py_], fill=_a(k["voor"], 179), width=int(p(2)))
        else:
            punten.append((px_, py_))
    if punten:
        d.line(punten, fill=_a(k["lijn"], 204), width=int(p(2)), joint="curve")
    if sx0 <= nu <= sx1:
        d.line([p(SX(nu)), p(sv[1]), p(SX(nu)), p(sv[3])], fill=_a(k["accent"], 255), width=int(p(2)))
    doek.mengen(l)


def _streep(d, punten, kleur, dikte, aan, uit):
    """Gestippelde lijn door een reeks punten."""
    rest_aan, aanstaan = aan, True
    for (ax, ay), (bx, by) in zip(punten, punten[1:]):
        lengte = math.hypot(bx - ax, by - ay)
        if lengte == 0:
            continue
        ux, uy = (bx - ax) / lengte, (by - ay) / lengte
        pos = 0.0
        while pos < lengte:
            stuk = min(rest_aan, lengte - pos)
            if aanstaan:
                d.line([ax + ux * pos, ay + uy * pos, ax + ux * (pos + stuk), ay + uy * (pos + stuk)],
                       fill=kleur, width=max(1, int(dikte)))
            pos += stuk
            rest_aan -= stuk
            if rest_aan <= 1e-6:
                aanstaan = not aanstaan
                rest_aan = aan if aanstaan else uit


# ------------------------------------------------------------------ kaart / achtergrond

_KUST_DIR = os.path.join(os.path.dirname(__file__), "static", "app-mobile", "kust")


def _kust(spot_id):
    pad = os.path.join(_KUST_DIR, f"{spot_id}.json")
    if not os.path.isfile(pad):
        return None
    with open(pad, encoding="utf-8") as f:
        return json.load(f)


def teken_achtergrond(doek, thema, spot_id, lat, lon, wind_kn, wind_dir, stroom_kn, stroom_dir,
                      breedte_dp=270.0, spot_x=0.80, spot_y=0.16):
    """Zachte uitlopende rand, kustkaart en de pijlen naar de spot."""
    k = _kleuren(thema)
    p = doek.px
    W, H = 640.0, doek.H * 640.0 / doek.W
    dp = W / max(breedte_dp, 100.0)
    # achtergrond: vier lagen met oplopende dekking
    l, d = doek.laag()
    for i, (alpha, radius) in enumerate(((31, 28), (71, 25), (133, 22), (217, 19))):
        inset = i * 3 * dp
        d.rounded_rectangle([p(inset), p(inset), p(W - inset), p(H - inset)], radius=int(p(radius * dp)),
                            fill=_a(k["bg"], alpha))
    doek.mengen(l)

    ox, oy = spot_x * W, spot_y * H
    kust = _kust(spot_id)
    km = W / 150.0
    kos = math.cos(math.radians(lat))

    def pt(q):
        return (p(ox + (q[0] - lon) * 111.32 * kos * km), p(oy - (q[1] - lat) * 111.32 * km))

    if kust:
        l, d = doek.laag()
        for ring in kust.get("land") or []:
            if len(ring) > 2:
                d.polygon([pt(q) for q in ring], fill=_a(k["tekst"], 18))
        for lijn_ in kust.get("kust") or []:
            if len(lijn_) > 1:
                d.line([pt(q) for q in lijn_], fill=_a(k["lijn"], 102), width=max(1, int(p(1.5))), joint="curve")
        # onder de kop stiller
        masker = doek.Image.new("L", l.size, 255)
        md = doek.ImageDraw.Draw(masker)
        y_a, y_b = H * 0.22, H * 0.45
        for yy in range(int(p(y_a)), l.size[1]):
            f = min(1.0, (yy - p(y_a)) / max(1.0, p(y_b) - p(y_a)))
            md.line([0, yy, l.size[0], yy], fill=int(255 * (1 - 0.92 * f)))
        l.putalpha(doek.Image.composite(l.getchannel("A"), doek.Image.new("L", l.size, 0), masker))
        # rand uitlopend
        rand = p(26 * dp * 0.8)
        m2 = doek.Image.new("L", l.size, 255)
        d2 = doek.ImageDraw.Draw(m2)
        for i in range(int(rand)):
            w = int(255 * i / rand)
            d2.rectangle([i, i, l.size[0] - 1 - i, l.size[1] - 1 - i], outline=w)
        l.putalpha(doek.Image.composite(l.getchannel("A"), doek.Image.new("L", l.size, 0), m2))
        doek.mengen(l)

    s = 0.55
    l, d = doek.laag()
    if wind_kn is not None and wind_dir is not None:
        _pijl(doek, d, ox, oy, (wind_dir + 180) % 360, (34 + min(wind_kn, 35) * 1.4) * s, _a(k["accent"], 255),
              _a(k["tekst"], 255), "wind", s)
    if stroom_kn and stroom_dir is not None and stroom_kn > 0:
        _pijl(doek, d, ox, oy, stroom_dir, (26 + min(stroom_kn, 3) * 22) * s, _a(k["voor"], 255),
              _a(k["tekst"], 255), "stroom", s)
    d.ellipse([p(ox - 10 * s), p(oy - 10 * s), p(ox + 10 * s), p(oy + 10 * s)], outline=_a(k["accent"], 255), width=max(1, int(p(2.5 * s))))
    d.ellipse([p(ox - 4 * s), p(oy - 4 * s), p(ox + 4 * s), p(oy + 4 * s)], fill=_a(k["accent"], 255))
    doek.mengen(l)


def _pijl(doek, d, sx, sy, graden, lengte, kleur, tekstkleur, label, s):
    p = doek.px
    r = math.radians(graden)
    hx, hy = math.sin(r), -math.cos(r)
    rand = 14 * s
    kx, ky = sx - hx * rand, sy - hy * rand
    ax, ay = kx - hx * lengte, ky - hy * lengte
    d.line([p(ax), p(ay), p(kx), p(ky)], fill=kleur, width=max(1, int(p(3.5 * s))))
    punt = 9 * s
    d.polygon([(p(kx), p(ky)),
               (p(kx - hx * punt - hy * punt * 0.6), p(ky - hy * punt + hx * punt * 0.6)),
               (p(kx - hx * punt + hy * punt * 0.6), p(ky - hy * punt - hx * punt * 0.6))], fill=kleur)
    uitl = "r" if hx > 0.3 else "l" if hx < -0.3 else "m"
    doek.tekst(d, ax - hx * 6 * s, ay - hy * 6 * s + 7 * s, label, 19 * s, tekstkleur, vet=True, uitlijning=uitl)


# ------------------------------------------------------------------ kop (voor het volledige beeld)

def teken_kop(doek, thema, w, offset_uren, ruimte_links=20.0):
    """Label midden bovenaan, wind groot, spot en details; voor het volledige beeld (iPhone)."""
    k = _kleuren(thema)
    p = doek.px
    l, d = doek.laag()
    oordeel = w.get("oordeel") or ""
    reden = w.get("reden") or ""
    pil = "GOED" if oordeel == "go" else (reden.upper() if oordeel == "nee" and reden else oordeel.upper())
    if pil:
        tb = doek.meet(pil, 19, vet=True)
        x0 = 320 - tb / 2 - 14
        d.rounded_rectangle([p(x0), p(10), p(x0 + tb + 28), p(40)], radius=int(p(15)), fill=_a(PIL_KLEUREN.get(oordeel, PIL_KLEUREN["nee"]), 255))
        doek.tekst(d, 320, 31, pil, 19, (255, 255, 255, 255) if oordeel == "nee" else _a(DONKER["bg"], 255), vet=True, uitlijning="m")
    doek.tekst(d, 640 - 26, 34, "⚙", 24, _a(k["zwak"], 255), uitlijning="r")
    if offset_uren:
        doek.tekst(d, 640 - 62, 33, "↺ nu", 18, _a(k["accent"], 255), vet=True, uitlijning="r")
    wind = "–" if w.get("windKn") is None else f'{w["windKn"]} kn'
    pijl = PIJLEN[int(round(w["dir"] / 45.0)) % 8] if w.get("dir") is not None else ""
    doek.tekst(d, 26, 82, f"{wind} {pijl}".strip(), 40, _a(k["tekst"], 255), vet=True)
    bx = 26 + doek.meet(f"{wind} {pijl}".strip(), 40, vet=True) + 16
    doek.tekst(d, bx, 62, w.get("name", ""), 22, _a(k["tekst"], 255), vet=True)
    tijd = (w.get("updatedAt") or "")
    tijd = tijd.split("T")[1][:5] if "T" in tijd else ""
    delen = [x for x in (tijd, f'vlagen {w["gustKn"]}' if w.get("gustKn") is not None else "",
                         reden if reden and oordeel != "nee" else (w.get("shore") or "").lower()) if x]
    doek.tekst(d, bx, 84, " · ".join(delen), 18, _a(k["zwak"], 255))
    doek.mengen(l)


# ------------------------------------------------------------------ samenstellen

def maak_png(soort, thema, breedte, hoogte, w, reeksen, offset_uren=0, breedte_dp=270.0, grafiek="wind"):
    """soort: 'kaart' (alleen achtergrond), een grafiek (alleen die grafiek), of 'volledig'."""
    import io
    doek = Doek(int(breedte), int(hoogte))
    if soort == "kaart":
        teken_achtergrond(doek, thema, w["id"], w.get("lat", 0), w.get("lon", 0), w.get("windKn"), w.get("dir"),
                          w.get("stroomKn"), w.get("stroomDir"), breedte_dp)
    elif soort == "volledig":
        teken_achtergrond(doek, thema, w["id"], w.get("lat", 0), w.get("lon", 0), w.get("windKn"), w.get("dir"),
                          w.get("stroomKn"), w.get("stroomDir"), breedte_dp, spot_x=0.80, spot_y=0.20)
        teken_kop(doek, thema, w, offset_uren)
        kop = 96.0
        teken_grafiek(doek, reeksen, grafiek if grafiek in SOORTEN and heeft(reeksen, grafiek) else "wind", offset_uren, thema,
                      oy=kop, hoogte=(doek.H * 640.0 / doek.W) - kop)
    else:
        teken_grafiek(doek, reeksen, soort, offset_uren, thema)
    uit = io.BytesIO()
    doek.klaar().save(uit, "PNG", optimize=True)
    return uit.getvalue()
