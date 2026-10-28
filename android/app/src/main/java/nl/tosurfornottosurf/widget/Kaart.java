package nl.tosurfornottosurf.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Kustkaart als decor achter de kop van de widget, zoals de achtergrond in de app.
 *  De spot staat rechts, zodat de windwaarde links vrij blijft. */
final class Kaart {
    static final int B = 720, H = 240;
    /** Breedte van het beeld in km: ruim genoeg om de kust te herkennen. */
    private static final double KM_BREED = 160;
    /** Plek van de spot in het beeld (fractie van breedte en hoogte). */
    private static final float SPOT_X = 0.80f, SPOT_Y = 0.62f;

    private Kaart() {}

    /** Kustdata van de app, per spot een bestand; lokaal bewaard na de eerste keer. */
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

    /** Geeft null als er voor deze spot geen kaart is. */
    static Bitmap teken(Context c, String spot, double lat, double lon) {
        try {
            JSONObject k = kust(c, spot);
            Bitmap bm = Bitmap.createBitmap(B, H, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(bm);
            double km = B / KM_BREED;                       // pixels per km
            double kosinus = Math.cos(Math.toRadians(lat));
            double ox = SPOT_X * B, oy = SPOT_Y * H;

            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            // Land: vlak met lage dekking; kustlijn: dun, ook laag. Het is decor.
            Path land = new Path();
            land.setFillType(Path.FillType.EVEN_ODD);
            JSONArray la = k.optJSONArray("land");
            if (la != null) for (int i = 0; i < la.length(); i++) ring(land, la.getJSONArray(i), lat, lon, kosinus, km, ox, oy, true);
            p.setStyle(Paint.Style.FILL);
            p.setColor((c.getColor(R.color.tekst) & 0x00FFFFFF) | 0x1A000000);
            cv.drawPath(land, p);

            Path lijn = new Path();
            JSONArray ku = k.optJSONArray("kust");
            if (ku != null) for (int i = 0; i < ku.length(); i++) ring(lijn, ku.getJSONArray(i), lat, lon, kosinus, km, ox, oy, false);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(2f);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor((c.getColor(R.color.lijn) & 0x00FFFFFF) | 0x99000000);
            cv.drawPath(lijn, p);

            // De spot: een stip met een zachte ring.
            p.setStyle(Paint.Style.FILL);
            p.setColor((c.getColor(R.color.accent) & 0x00FFFFFF) | 0x40000000);
            cv.drawCircle((float) ox, (float) oy, 22f, p);
            p.setColor(c.getColor(R.color.accent));
            cv.drawCircle((float) ox, (float) oy, 9f, p);
            return bm;
        } catch (Exception e) {
            return null;
        }
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
