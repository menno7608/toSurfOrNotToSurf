package nl.tosurfornottosurf.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

/** Tekent één grafiek: de komende 24 uur vanaf het gekozen punt, met onderin een weekstrook
 *  die subtiel laat zien waar je in de week zit. */
final class Grafiek {
    static final String[] SOORTEN = {"wind", "regen", "golven", "getij", "stroom"};
    static final String[] NAMEN = {"Wind", "Regen", "Golven", "Getij", "Stroming"};

    static final int UREN = 24;          // zichtbaar venster
    static final int STAP = 12;          // uren per tik
    static final int MIN_OFFSET = -36;   // verste stap het verleden in
    static final int MAX_OFFSET = 132;   // verste stap de toekomst in

    private static final int LINKS = 44, RECHTS = 10, BOVEN = 22, UURLABELS = 22, STROOK = 42;
    private static int TEKST, RASTER, LIJN, VOORSPELLING, VLAAG, ACCENT, BAND;

    private Grafiek() {}

    static String naam(String soort) {
        for (int i = 0; i < SOORTEN.length; i++) if (SOORTEN[i].equals(soort)) return NAMEN[i];
        return soort;
    }

    static boolean heeft(JSONObject d, String soort) {
        JSONArray a = d.optJSONArray(sleutel(soort));
        return a != null && a.length() > 1;
    }

    private static String sleutel(String soort) {
        switch (soort) {
            case "regen": return "regen";
            case "golven": return "golven";
            case "getij": return "getij";
            case "stroom": return "stroom";
            default: return "wind";
        }
    }

    private static long epoch(String t) {
        return LocalDateTime.parse(t).toEpochSecond(ZoneOffset.UTC);
    }

    private static final String[] DAGEN = {"ma", "di", "wo", "do", "vr", "za", "zo"};

    private static String dag(long t) {
        return DAGEN[(int) (((t / 86400) + 3) % 7)];
    }

    static Bitmap teken(Context ctx, JSONObject d, String soort, int offsetUren, int B, int H) throws Exception {
        TEKST = ctx.getColor(R.color.tekst_zwak);
        RASTER = ctx.getColor(R.color.raster);
        LIJN = ctx.getColor(R.color.lijn);
        VOORSPELLING = ctx.getColor(R.color.voorspelling);
        VLAAG = ctx.getColor(R.color.vlaag);
        ACCENT = ctx.getColor(R.color.accent);
        BAND = ctx.getColor(R.color.band);

        Bitmap bm = Bitmap.createBitmap(B, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        JSONArray a = d.getJSONArray(sleutel(soort));
        int n = a.length();
        if (n < 2) return bm;

        String veld = soort.equals("wind") ? "kn" : soort.equals("regen") ? "mm" : soort.equals("golven") ? "hs"
                : soort.equals("getij") ? "m" : "kn";
        long[] x = new long[n];
        double[] y = new double[n], g = new double[n];
        for (int i = 0; i < n; i++) {
            JSONObject p = a.getJSONObject(i);
            x[i] = epoch(p.getString("t"));
            y[i] = p.isNull(veld) ? Double.NaN : p.getDouble(veld);
            g[i] = soort.equals("wind") && !p.isNull("gust") ? p.getDouble("gust") : Double.NaN;
        }
        long x0 = x[0], x1 = x[n - 1];
        long nu = epoch(d.getString("nowAt"));

        // Venster: UREN uur vanaf nu + offset, binnen de data.
        long ws = nu - (UREN / 2) * 3600L + offsetUren * 3600L; // nu staat in het midden
        ws = Math.max(x0, Math.min(ws, x1 - UREN * 3600L));
        long we = ws + UREN * 3600L;

        // Y-bereik uit het venster.
        double lo = 0, hi = 0;
        for (int i = 0; i < n; i++) {
            if (x[i] < ws - 3600 || x[i] > we + 3600) continue;
            if (!Double.isNaN(y[i])) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
            if (!Double.isNaN(g[i])) hi = Math.max(hi, g[i]);
        }
        if (soort.equals("wind") && !d.isNull("maxKn")) hi = Math.max(hi, d.getDouble("maxKn"));
        double stap = mooieStap(hi - lo);
        hi = Math.ceil(hi / stap) * stap;
        lo = Math.floor(lo / stap) * stap;
        if (hi - lo < stap) hi = lo + stap;

        RectF vlak = new RectF(LINKS, BOVEN, B - RECHTS, H - STROOK - UURLABELS);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        // Horizontale rasterlijnen.
        p.setTextSize(20);
        for (double v = lo; v <= hi + 1e-9; v += stap) {
            float py = yPos(v, lo, hi, vlak);
            p.setColor(RASTER); p.setStrokeWidth(1); p.setStyle(Paint.Style.STROKE);
            c.drawLine(vlak.left, py, vlak.right, py, p);
            p.setColor(TEKST); p.setStyle(Paint.Style.FILL); p.setTextAlign(Paint.Align.RIGHT);
            c.drawText(label(v, stap), vlak.left - 6, py + 7, p);
        }

        // Verticale lijnen en uurlabels elke 3 uur; middernacht draagt de dagnaam.
        long eerste = ((ws + 3 * 3600 - 1) / (3 * 3600)) * (3 * 3600);
        p.setTextAlign(Paint.Align.CENTER);
        for (long t = eerste; t <= we; t += 3 * 3600) {
            float px = xPos(t, ws, we, vlak);
            p.setColor(RASTER); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1);
            c.drawLine(px, vlak.top, px, vlak.bottom, p);
            long uur = (t / 3600) % 24;
            p.setStyle(Paint.Style.FILL); p.setColor(TEKST);
            c.drawText(uur == 0 ? dag(t) : String.format(Locale.US, "%02d", uur), px, vlak.bottom + 22, p);
        }

        // Gewenst windbereik.
        if (soort.equals("wind") && !d.isNull("minKn") && !d.isNull("maxKn")) {
            p.setStyle(Paint.Style.FILL); p.setColor(BAND);
            c.drawRect(vlak.left, yPos(Math.min(d.getDouble("maxKn"), hi), lo, hi, vlak),
                    vlak.right, yPos(Math.max(d.getDouble("minKn"), lo), lo, hi, vlak), p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.5f); p.setColor((BAND & 0x00FFFFFF) | 0x99000000);
            p.setPathEffect(new DashPathEffect(new float[]{6, 6}, 0));
            float yH = yPos(Math.min(d.getDouble("maxKn"), hi), lo, hi, vlak), yL = yPos(Math.max(d.getDouble("minKn"), lo), lo, hi, vlak);
            c.drawLine(vlak.left, yH, vlak.right, yH, p);
            c.drawLine(vlak.left, yL, vlak.right, yL, p);
            p.setPathEffect(null);
        }

        // De reeks, geknipt op het venster.
        c.save();
        c.clipRect(vlak.left, vlak.top - 2, vlak.right, vlak.bottom + 2);
        float nuX = xPos(Math.max(ws, Math.min(nu, we)), ws, we, vlak);
        if (soort.equals("regen")) {
            p.setStyle(Paint.Style.FILL); p.setColor(VOORSPELLING);
            float bw = Math.max(3f, vlak.width() / UREN * 0.8f);
            for (int i = 0; i < n; i++) {
                if (Double.isNaN(y[i]) || y[i] <= 0) continue;
                float px = xPos(x[i], ws, we, vlak);
                c.drawRect(px - bw / 2, yPos(y[i], lo, hi, vlak), px + bw / 2, yPos(0, lo, hi, vlak), p);
            }
        } else {
            if (soort.equals("wind")) lijn(c, p, x, g, ws, we, lo, hi, vlak, VLAAG, true);
            c.save();
            c.clipRect(vlak.left - 4, 0, nuX, B * 4);
            lijn(c, p, x, y, ws, we, lo, hi, vlak, LIJN, false);
            c.restore();
            c.save();
            c.clipRect(nuX, 0, B, B * 4);
            lijn(c, p, x, y, ws, we, lo, hi, vlak, VOORSPELLING, soort.equals("wind"));
            c.restore();
        }
        c.restore();

        // Windrichting elke 3 uur langs de bovenkant.
        if (soort.equals("wind")) {
            p.setStyle(Paint.Style.FILL); p.setColor(TEKST); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(20);
            String[] pijl = {"↓", "↙", "←", "↖", "↑", "↗", "→", "↘"};
            for (int i = 0; i < n; i++) {
                JSONObject q = a.getJSONObject(i);
                if (q.isNull("dir") || x[i] < ws || x[i] > we || (x[i] / 3600) % 3 != 0) continue;
                c.drawText(pijl[Math.round(q.getInt("dir") / 45f) % 8], xPos(x[i], ws, we, vlak), BOVEN - 6, p);
            }
        }

        // Titel met eenheid, klein in de hoek van de plot; een rand in de achtergrondkleur houdt hem leesbaar.
        String eenheid = soort.equals("regen") ? "mm" : soort.equals("golven") || soort.equals("getij") ? "m" : "kn";
        String titel = naam(soort) + " · " + eenheid;
        p.setTextSize(20); p.setFakeBoldText(true); p.setTextAlign(Paint.Align.LEFT);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(5); p.setColor(ctx.getColor(R.color.bg_a4));
        c.drawText(titel, vlak.left + 8, vlak.top + 20, p);
        p.setStyle(Paint.Style.FILL); p.setColor((ctx.getColor(R.color.tekst) & 0x00FFFFFF) | 0xE6000000);
        c.drawText(titel, vlak.left + 8, vlak.top + 20, p);
        p.setFakeBoldText(false);

        // Legenda bij wind: wat is gemiddeld en wat zijn vlagen.
        if (soort.equals("wind")) {
            p.setTextSize(16); p.setTextAlign(Paint.Align.RIGHT);
            p.setColor(TEKST);
            float ly = vlak.top + 17, rx = vlak.right - 6;
            c.drawText("vlagen", rx, ly, p);
            float w1 = p.measureText("vlagen");
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f); p.setColor(VLAAG);
            p.setPathEffect(new DashPathEffect(new float[]{5, 4}, 0));
            c.drawLine(rx - w1 - 30, ly - 5, rx - w1 - 8, ly - 5, p);
            p.setPathEffect(null);
            p.setStyle(Paint.Style.FILL); p.setColor(TEKST);
            float rx2 = rx - w1 - 40;
            c.drawText("gemiddeld", rx2, ly, p);
            float w2 = p.measureText("gemiddeld");
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(3f); p.setColor(VOORSPELLING);
            c.drawLine(rx2 - w2 - 30, ly - 5, rx2 - w2 - 8, ly - 5, p);
            p.setStyle(Paint.Style.FILL);
        }

        // Nu: een fijne stippellijn en een oranje punt op de lijn zelf.
        if (nu >= ws && nu <= we) {
            p.setStyle(Paint.Style.STROKE); p.setColor((ACCENT & 0x00FFFFFF) | 0x88000000); p.setStrokeWidth(1.5f);
            p.setPathEffect(new DashPathEffect(new float[]{6, 6}, 0));
            c.drawLine(nuX, vlak.top, nuX, vlak.bottom, p);
            p.setPathEffect(null);
            double wn = waardeOp(x, y, nu);
            if (!Double.isNaN(wn)) {
                float py = yPos(wn, lo, hi, vlak);
                p.setStyle(Paint.Style.FILL); p.setColor(ctx.getColor(R.color.bg_a4));
                c.drawCircle(nuX, py, 10, p);
                p.setColor(ACCENT);
                c.drawCircle(nuX, py, 7, p);
            }
        }

        // Tikzones: een subtiel pijltje links en rechts, als er die kant op nog iets is.
        p.setStyle(Paint.Style.FILL); p.setTextSize(40); p.setTextAlign(Paint.Align.CENTER);
        p.setColor((TEKST & 0x00FFFFFF) | 0x66000000);
        if (ws > x0) c.drawText("‹", vlak.left + 14, (vlak.top + vlak.bottom) / 2 + 12, p);
        if (we < x1) c.drawText("›", vlak.right - 14, (vlak.top + vlak.bottom) / 2 + 12, p);

        strook(c, p, x, y, x0, x1, ws, we, nu, soort, B, H, vlak);
        return bm;
    }

    /** De hele week in het klein, met het zichtbare venster gemarkeerd. */
    private static void strook(Canvas c, Paint p, long[] x, double[] y, long x0, long x1, long ws, long we, long nu,
                               String soort, int B, int H, RectF vlak) {
        RectF s = new RectF(vlak.left, H - STROOK + 4, vlak.right, H - 17);
        double lo = 0, hi = 0;
        for (double v : y) if (!Double.isNaN(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
        if (hi - lo < 1e-6) hi = lo + 1;

        // Dagen: lichte scheidingslijn en label.
        p.setTextSize(18); p.setTextAlign(Paint.Align.CENTER);
        long dag = 86400;
        for (long m = ((x0 / dag) + 1) * dag; m < x1; m += dag) {
            float px = xPos(m, x0, x1, s);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1); p.setColor(RASTER);
            c.drawLine(px, s.top, px, s.bottom, p);
        }
        p.setStyle(Paint.Style.FILL); p.setColor((TEKST & 0x00FFFFFF) | 0xD9000000);
        for (long m = (x0 / dag) * dag; m < x1; m += dag) {
            long a = Math.max(m, x0), b = Math.min(m + dag, x1);
            if (b - a < 8 * 3600) continue;
            c.drawText(dag(m), xPos(a + (b - a) / 2, x0, x1, s), H - 3, p);
        }

        // Het zichtbare venster, zacht gemarkeerd.
        float vx0 = xPos(Math.max(ws, x0), x0, x1, s), vx1 = xPos(Math.min(we, x1), x0, x1, s);
        p.setStyle(Paint.Style.FILL); p.setColor((ACCENT & 0x00FFFFFF) | 0x2E000000);
        c.drawRoundRect(new RectF(vx0, s.top - 4, vx1, s.bottom + 4), 6, 6, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.5f); p.setColor((ACCENT & 0x00FFFFFF) | 0x99000000);
        c.drawRoundRect(new RectF(vx0, s.top - 4, vx1, s.bottom + 4), 6, 6, p);

        // De reeks zelf, dun en rustig.
        Path pad = new Path();
        boolean open = false;
        boolean staaf = soort.equals("regen");
        for (int i = 0; i < x.length; i++) {
            if (Double.isNaN(y[i])) { open = false; continue; }
            float px = xPos(x[i], x0, x1, s);
            float py = s.bottom - (float) ((y[i] - lo) / (hi - lo)) * s.height();
            if (staaf) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2); p.setColor((VOORSPELLING & 0x00FFFFFF) | 0xB3000000);
                c.drawLine(px, s.bottom, px, py, p);
            } else {
                if (open) pad.lineTo(px, py); else pad.moveTo(px, py);
                open = true;
            }
        }
        if (!staaf) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2); p.setColor((LIJN & 0x00FFFFFF) | 0xCC000000);
            p.setStrokeJoin(Paint.Join.ROUND);
            c.drawPath(pad, p);
        }
        // Nu.
        if (nu >= x0 && nu <= x1) {
            float px = xPos(nu, x0, x1, s);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2); p.setColor(ACCENT);
            c.drawLine(px, s.top, px, s.bottom, p);
        }
    }

    private static void lijn(Canvas c, Paint p, long[] x, double[] y, long x0, long x1, double lo, double hi,
                             RectF vlak, int kleur, boolean streep) {
        Path pad = new Path();
        boolean open = false;
        for (int i = 0; i < x.length; i++) {
            if (Double.isNaN(y[i])) { open = false; continue; }
            float px = xPos(x[i], x0, x1, vlak), py = yPos(y[i], lo, hi, vlak);
            if (open) pad.lineTo(px, py); else pad.moveTo(px, py);
            open = true;
        }
        p.setStyle(Paint.Style.STROKE); p.setColor(kleur); p.setStrokeWidth(streep ? 2.5f : 3.5f);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setPathEffect(streep ? new DashPathEffect(new float[]{8, 6}, 0) : null);
        c.drawPath(pad, p);
        p.setPathEffect(null);
    }

    /** Lineair geïnterpoleerde waarde op tijdstip t. */
    private static double waardeOp(long[] x, double[] y, long t) {
        for (int i = 1; i < x.length; i++) {
            if (x[i] >= t && x[i - 1] <= t) {
                if (Double.isNaN(y[i]) || Double.isNaN(y[i - 1])) return Double.NaN;
                double f = x[i] == x[i - 1] ? 0 : (double) (t - x[i - 1]) / (x[i] - x[i - 1]);
                return y[i - 1] + (y[i] - y[i - 1]) * f;
            }
        }
        return Double.NaN;
    }

    private static String uur(long t) {
        return String.format(Locale.US, "%02d:00", (t / 3600) % 24);
    }

    private static float xPos(long t, long x0, long x1, RectF v) {
        return v.left + (float) (t - x0) / (x1 - x0) * v.width();
    }

    private static float yPos(double w, double lo, double hi, RectF v) {
        return v.bottom - (float) ((w - lo) / (hi - lo)) * v.height();
    }

    private static double mooieStap(double bereik) {
        double[] opties = {0.1, 0.2, 0.5, 1, 2, 5, 10, 20};
        for (double o : opties) if (bereik / o <= 4) return o;
        return 50;
    }

    private static String label(double v, double stap) {
        return stap < 1 ? String.format(Locale.US, "%.1f", v) : String.format(Locale.US, "%d", Math.round(v));
    }
}
