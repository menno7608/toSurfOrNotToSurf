package nl.tosurfornottosurf.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Kustkaart als achtergrond van de hele widget, zoals de achtergrond in de app:
 *  de spot staat rechtsboven (weg van de windwaarde links) met de wind- en stroompijl erop gericht. */
final class Kaart {
    /** Breedte van het beeld in km. */
    private static final double KM_BREED = 150;
    private static final float SPOT_X = 0.80f, SPOT_Y = 0.16f;

    private Kaart() {}

    /** Kustdata van de app, per spot een bestand; een week lokaal bewaard. */
    private static JSONObject kust(Context c, String spot) throws Exception {
        File f = new File(c.getCacheDir(), "kust-" + spot + ".json");
        if (f.exists() && System.currentTimeMillis() - f.lastModified() < 7L * 86400 * 1000) {
            byte[] b = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int gelezen = 0;
                while (gelezen < b.length) {
                    int n = in.read(b, gelezen, b.length - gelezen);
                    if (n < 0) break;
                    gelezen += n;
                }
            }
            return new JSONObject(new String(b, StandardCharsets.UTF_8));
        }
        String tekst = Api.haal("/mobile/kust/" + spot + ".json");
        try (FileOutputStream uit = new FileOutputStream(f)) {
            uit.write(tekst.getBytes(StandardCharsets.UTF_8));
        }
        return new JSONObject(tekst);
    }

    /** Tekent de hele achtergrond van de widget: zachte rand, kustkaart (als die er is) en de pijlen
     *  naar de spot. `c` draagt het thema (licht/donker) van deze widget. */
    static Bitmap teken(Context c, String spot, double lat, double lon, int B, int H, float breedteDp,
                        Double windKn, Integer windDir, Double stroomKn, Integer stroomDir) {
        Bitmap bm = Bitmap.createBitmap(B, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        float dp = B / Math.max(breedteDp, 100f);               // pixels per dp
        double ox = SPOT_X * B, oy = SPOT_Y * H;

        // Achtergrond: vier lagen met oplopende dekking, de rand vloeit uit naar transparant.
        Paint vul = new Paint(Paint.ANTI_ALIAS_FLAG);
        vul.setStyle(Paint.Style.FILL);
        int[] kleuren = {c.getColor(R.color.bg_a1), c.getColor(R.color.bg_a2), c.getColor(R.color.bg_a3), c.getColor(R.color.bg_a4)};
        float[] radius = {28, 25, 22, 19};
        for (int i = 0; i < 4; i++) {
            vul.setColor(kleuren[i]);
            float inset = i * 3 * dp;
            cv.drawRoundRect(new android.graphics.RectF(inset, inset, B - inset, H - inset), radius[i] * dp, radius[i] * dp, vul);
        }

        // De kaart op een eigen laag, zodat zijn rand apart kan uitlopen.
        Bitmap laag = Bitmap.createBitmap(B, H, Bitmap.Config.ARGB_8888);
        Canvas kv = new Canvas(laag);
        try {
            JSONObject k = kust(c, spot);
            double km = B / KM_BREED;                       // pixels per km
            double kosinus = Math.cos(Math.toRadians(lat));
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            Path land = new Path();
            land.setFillType(Path.FillType.EVEN_ODD);
            JSONArray la = k.optJSONArray("land");
            if (la != null) for (int i = 0; i < la.length(); i++) ring(land, la.getJSONArray(i), lat, lon, kosinus, km, ox, oy, true);
            p.setStyle(Paint.Style.FILL);
            p.setColor((c.getColor(R.color.tekst) & 0x00FFFFFF) | 0x12000000);
            kv.drawPath(land, p);

            Path lijn = new Path();
            JSONArray ku = k.optJSONArray("kust");
            if (ku != null) for (int i = 0; i < ku.length(); i++) ring(lijn, ku.getJSONArray(i), lat, lon, kosinus, km, ox, oy, false);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(1.5f);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor((c.getColor(R.color.lijn) & 0x00FFFFFF) | 0x66000000);
            kv.drawPath(lijn, p);

            // Onder de kop wordt het decor stiller, zodat de grafieklijnen leesbaar blijven.
            Paint f = new Paint();
            f.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OUT));
            f.setShader(new LinearGradient(0, H * 0.22f, 0, H * 0.45f, Color.argb(0, 0, 0, 0), Color.argb(235, 0, 0, 0), Shader.TileMode.CLAMP));
            kv.drawRect(0, H * 0.22f, B, H, f);
        } catch (Exception e) {
            // Geen kustdata voor deze spot: de widget werkt gewoon zonder kaart.
        }
        randUitvloeien(kv, B, H, 26f * dp * 0.8f);
        cv.drawBitmap(laag, 0, 0, null);
        laag.recycle();

        // Pijlen wijzen naar de spot toe, zoals in de app: de wind gaat de kant op van richting+180.
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float s = B / 640f * 0.75f;
        if (windKn != null && windDir != null) {
            pijl(cv, p, (float) ox, (float) oy, (windDir + 180) % 360,
                    (float) ((34 + Math.min(windKn, 35) * 1.4) * s), c.getColor(R.color.accent),
                    c.getColor(R.color.tekst), "", s);
        }
        if (stroomKn != null && stroomDir != null && stroomKn > 0) {
            pijl(cv, p, (float) ox, (float) oy, stroomDir,
                    (float) ((26 + Math.min(stroomKn, 3) * 22) * s), c.getColor(R.color.voorspelling),
                    c.getColor(R.color.tekst), String.format(java.util.Locale.US, "%.1f kn", stroomKn), s);
        }

        // De spot zelf: ring met stip.
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f * s); p.setColor(c.getColor(R.color.accent));
        cv.drawCircle((float) ox, (float) oy, 10f * s, p);
        p.setStyle(Paint.Style.FILL);
        cv.drawCircle((float) ox, (float) oy, 4f * s, p);
        return bm;
    }

    /** Pijl die eindigt bij de spot; graden = waar het heen gaat (0 = noord). */
    private static void pijl(Canvas cv, Paint p, float sx, float sy, double graden, float lengte,
                             int kleur, int tekstKleur, String label, float s) {
        double r = Math.toRadians(graden);
        float hx = (float) Math.sin(r), hy = (float) -Math.cos(r);       // richting van de pijl
        float rand = 14f * s;
        float kopX = sx - hx * rand, kopY = sy - hy * rand;
        float staartX = kopX - hx * lengte, staartY = kopY - hy * lengte;

        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(3.5f * s); p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(kleur);
        p.setPathEffect(null);
        p.setStyle(Paint.Style.STROKE);
        cv.drawLine(staartX, staartY, kopX, kopY, p);

        float punt = 9f * s;
        Path kop = new Path();
        kop.moveTo(kopX, kopY);
        kop.lineTo(kopX - hx * punt - hy * punt * 0.6f, kopY - hy * punt + hx * punt * 0.6f);
        kop.lineTo(kopX - hx * punt + hy * punt * 0.6f, kopY - hy * punt - hx * punt * 0.6f);
        kop.close();
        p.setStyle(Paint.Style.FILL);
        cv.drawPath(kop, p);

        if (label != null && !label.isEmpty()) {
        // Label aan de staart, van de pijl af.
        p.setStyle(Paint.Style.FILL);
        p.setTextSize(19f * s);
        p.setTextAlign(hx > 0.3f ? Paint.Align.RIGHT : hx < -0.3f ? Paint.Align.LEFT : Paint.Align.CENTER);
        p.setColor(tekstKleur);
        p.setFakeBoldText(true);
        cv.drawText(label, staartX - hx * 6f * s, staartY - hy * 6f * s + 7f * s, p);
        p.setFakeBoldText(false);
        }
    }

    /** De rand loopt uit naar transparant: de widget zweeft op het beginscherm. */
    private static void randUitvloeien(Canvas cv, int B, int H, float breedte) {
        Paint m = new Paint();
        m.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OUT));
        int dicht = Color.argb(255, 0, 0, 0), weg = Color.argb(0, 0, 0, 0);
        m.setShader(new LinearGradient(0, 0, breedte, 0, dicht, weg, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, breedte, H, m);
        m.setShader(new LinearGradient(B, 0, B - breedte, 0, dicht, weg, Shader.TileMode.CLAMP));
        cv.drawRect(B - breedte, 0, B, H, m);
        m.setShader(new LinearGradient(0, 0, 0, breedte, dicht, weg, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, B, breedte, m);
        m.setShader(new LinearGradient(0, H, 0, H - breedte, dicht, weg, Shader.TileMode.CLAMP));
        cv.drawRect(0, H - breedte, B, H, m);
    }

    private static void ring(Path pad, JSONArray punten, double lat0, double lon0, double kos,
                             double pxPerKm, double ox, double oy, boolean sluit) throws Exception {
        for (int i = 0; i < punten.length(); i++) {
            JSONArray q = punten.getJSONArray(i);
            float x = (float) (ox + (q.getDouble(0) - lon0) * 111.32 * kos * pxPerKm);
            float y = (float) (oy - (q.getDouble(1) - lat0) * 111.32 * pxPerKm);
            if (i == 0) pad.moveTo(x, y); else pad.lineTo(x, y);
        }
        if (sluit) pad.close();
    }
}
