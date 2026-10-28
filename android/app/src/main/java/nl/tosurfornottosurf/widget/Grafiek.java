package nl.tosurfornottosurf.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

/** Tekent één grafiek (wind, regen, golven, getij, stroming) als bitmap. */
final class Grafiek {
    static final String[] SOORTEN = {"wind", "regen", "golven", "getij", "stroom"};
    static final String[] NAMEN = {"Wind", "Regen", "Golven", "Getij", "Stroming"};

    static final int B = 720, H = 300;
    private static final int LINKS = 64, RECHTS = 14, BOVEN = 28, ONDER = 40;
    // Themakleuren (res/values en values-night), gezet bij elke teken().
    private static int TEKST, RASTER, LIJN, VOORSPELLING, VLAAG, ACCENT, BAND;

    private Grafiek() {}

    static String naam(String soort) {
        for (int i = 0; i < SOORTEN.length; i++) if (SOORTEN[i].equals(soort)) return NAMEN[i];
        return soort;
    }

    /** Is er voor deze soort data in het antwoord? */
    static boolean heeft(JSONObject d, String soort) {
        JSONArray a = d.optJSONArray(sleutel(soort));
        return a != null && a.length() > 1;
    }

    private static String sleutel(String soort) {
        return soort.equals("regen") ? "regen" : soort.equals("golven") ? "golven"
                : soort.equals("getij") ? "getij" : soort.equals("stroom") ? "stroom" : "wind";
    }

    private static long epoch(String t) {
        return LocalDateTime.parse(t).toEpochSecond(ZoneOffset.UTC);
    }

    static Bitmap teken(Context ctx, JSONObject d, String soort) throws Exception {
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

        long[] x = new long[n];
        double[] y = new double[n];
        double[] y2 = new double[n];
        String veld = soort.equals("wind") ? "kn" : soort.equals("regen") ? "mm" : soort.equals("golven") ? "hs"
                : soort.equals("getij") ? "m" : "kn";
        for (int i = 0; i < n; i++) {
            JSONObject p = a.getJSONObject(i);
            x[i] = epoch(p.getString("t"));
            y[i] = p.isNull(veld) ? Double.NaN : p.getDouble(veld);
            y2[i] = soort.equals("wind") && !p.isNull("gust") ? p.getDouble("gust") : Double.NaN;
        }
        long x0 = x[0], x1 = x[n - 1];
        if (x1 <= x0) return bm;

        double lo = 0, hi = 0;
        for (int i = 0; i < n; i++) {
            if (!Double.isNaN(y[i])) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
            if (!Double.isNaN(y2[i])) hi = Math.max(hi, y2[i]);
        }
        if (soort.equals("wind") && !d.isNull("maxKn")) hi = Math.max(hi, d.getDouble("maxKn"));
        double stap = mooieStap(hi - lo);
        hi = Math.ceil(hi / stap) * stap;
        lo = Math.floor(lo / stap) * stap;
        if (hi - lo < stap) hi = lo + stap;
        final double fl = lo, fh = hi;

        RectF vlak = new RectF(LINKS, BOVEN, B - RECHTS, H - ONDER);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTextSize(22);

        // Horizontale rasterlijnen met waarden.
        for (double v = lo; v <= hi + 1e-9; v += stap) {
            float py = yPos(v, fl, fh, vlak);
            p.setColor(RASTER); p.setStrokeWidth(1); p.setStyle(Paint.Style.STROKE);
            c.drawLine(vlak.left, py, vlak.right, py, p);
            p.setColor(TEKST); p.setStyle(Paint.Style.FILL); p.setTextAlign(Paint.Align.RIGHT);
            c.drawText(label(v, stap), vlak.left - 8, py + 8, p);
        }

        // Gewenst windbereik van de spot als zachte band.
        if (soort.equals("wind") && !d.isNull("minKn") && !d.isNull("maxKn")) {
            p.setStyle(Paint.Style.FILL); p.setColor(BAND);
            c.drawRect(vlak.left, yPos(Math.min(d.getDouble("maxKn"), hi), fl, fh, vlak),
                    vlak.right, yPos(Math.max(d.getDouble("minKn"), lo), fl, fh, vlak), p);
        }

        // Dagen: verticale lijn om middernacht en weekdag in het midden van de dag.
        String[] dagen = {"ma", "di", "wo", "do", "vr", "za", "zo"};
        long dag = 86400;
        long eerste = ((x0 / dag) + 1) * dag;
        for (long m = eerste; m < x1; m += dag) {
            float px = xPos(m, x0, x1, vlak);
            p.setColor(RASTER); p.setStrokeWidth(1); p.setStyle(Paint.Style.STROKE);
            c.drawLine(px, vlak.top, px, vlak.bottom, p);
        }
        p.setStyle(Paint.Style.FILL); p.setColor(TEKST); p.setTextAlign(Paint.Align.CENTER);
        for (long m = (x0 / dag) * dag; m < x1; m += dag) {
            long midden = Math.max(m, x0) + (Math.min(m + dag, x1) - Math.max(m, x0)) / 2;
            if (Math.min(m + dag, x1) - Math.max(m, x0) < 6 * 3600) continue; // te smal voor een label
            int wd = (int) (((m / dag) + 3) % 7); // 1970-01-01 was een donderdag
            c.drawText(dagen[wd], xPos(midden, x0, x1, vlak), H - 10, p);
        }

        if (soort.equals("regen")) {
            p.setStyle(Paint.Style.FILL); p.setColor(VOORSPELLING);
            float bw = Math.max(2f, vlak.width() / n * 0.8f);
            for (int i = 0; i < n; i++) {
                if (Double.isNaN(y[i]) || y[i] <= 0) continue;
                float px = xPos(x[i], x0, x1, vlak);
                c.drawRect(px - bw / 2, yPos(y[i], fl, fh, vlak), px + bw / 2, yPos(0, fl, fh, vlak), p);
            }
        } else {
            // Zoals in de app: gemeten tot nu doorgetrokken, de verwachting gestreept.
            long nuT = epoch(d.getString("nowAt"));
            float nuX = xPos(Math.max(x0, Math.min(nuT, x1)), x0, x1, vlak);
            if (soort.equals("wind")) lijn(c, p, x, y2, x0, x1, fl, fh, vlak, VLAAG, true);
            c.save();
            c.clipRect(vlak.left - 4, 0, nuX, H);
            lijn(c, p, x, y, x0, x1, fl, fh, vlak, LIJN, false);
            c.restore();
            c.save();
            c.clipRect(nuX, 0, B, H);
            lijn(c, p, x, y, x0, x1, fl, fh, vlak, VOORSPELLING, soort.equals("wind"));
            c.restore();
        }

        // Windrichting als pijltjes langs de bovenkant, elke 6 uur.
        if (soort.equals("wind")) {
            p.setStyle(Paint.Style.FILL); p.setColor(TEKST); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(20);
            String[] pijl = {"↓", "↙", "←", "↖", "↑", "↗", "→", "↘"};
            for (int i = 0; i < n; i++) {
                JSONObject q = a.getJSONObject(i);
                if (q.isNull("dir") || (x[i] / 3600) % 6 != 0) continue;
                c.drawText(pijl[Math.round(q.getInt("dir") / 45f) % 8], xPos(x[i], x0, x1, vlak), 20, p);
            }
        }

        // Nu-markering.
        long nu = epoch(d.getString("nowAt"));
        if (nu >= x0 && nu <= x1) {
            float px = xPos(nu, x0, x1, vlak);
            p.setStyle(Paint.Style.STROKE); p.setColor(ACCENT); p.setStrokeWidth(2);
            p.setPathEffect(new DashPathEffect(new float[]{8, 6}, 0));
            c.drawLine(px, vlak.top, px, vlak.bottom, p);
            p.setPathEffect(null);
        }
        return bm;
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
        p.setStyle(Paint.Style.STROKE); p.setColor(kleur); p.setStrokeWidth(streep ? 2f : 3f);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setPathEffect(streep ? new DashPathEffect(new float[]{8, 6}, 0) : null);
        c.drawPath(pad, p);
        p.setPathEffect(null);
    }

    private static float xPos(long t, long x0, long x1, RectF v) {
        return v.left + (float) (t - x0) / (x1 - x0) * v.width();
    }

    private static float yPos(double w, double lo, double hi, RectF v) {
        return v.bottom - (float) ((w - lo) / (hi - lo)) * v.height();
    }

    private static double mooieStap(double bereik) {
        double[] opties = {0.1, 0.2, 0.5, 1, 2, 5, 10, 20};
        for (double o : opties) if (bereik / o <= 5) return o;
        return 50;
    }

    private static String label(double v, double stap) {
        return stap < 1 ? String.format(Locale.US, "%.1f", v) : String.format(Locale.US, "%d", Math.round(v));
    }
}
