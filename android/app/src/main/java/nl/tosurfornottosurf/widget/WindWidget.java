package nl.tosurfornottosurf.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.view.View;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class WindWidget extends AppWidgetProvider {
    static final String PREFS = "widget";
    static final String ACTION_SCROLL = "nl.tosurfornottosurf.widget.SCROLL";
    static final int PADDING_H_DP = 20;
    static final int PADDING_V_DP = 12;
    /** Hoogte van de kop (46dp) plus een beetje lucht. */
    static final int KOP_DP = 50;

    static String spotVan(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("spot" + widgetId, "");
    }

    static void bewaarSpot(Context c, int widgetId, String spotId) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("spot" + widgetId, spotId).apply();
    }

    static String standaardGrafiek(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("grafiek" + widgetId, "wind");
    }

    static void bewaarGrafiek(Context c, int widgetId, String soort) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("grafiek" + widgetId, soort).apply();
    }

    /** Thema van deze widget: auto (volgt de telefoon), licht of donker. */
    static String themaVan(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("thema" + widgetId, "auto");
    }

    static void bewaarThema(Context c, int widgetId, String thema) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("thema" + widgetId, thema).apply();
    }

    /** Een Context met het thema van deze widget, zodat getColor() licht of donker geeft. */
    static Context thema(Context c, int widgetId) {
        String t = themaVan(c, widgetId);
        if (!t.equals("licht") && !t.equals("donker")) return c;
        android.content.res.Configuration cfg = new android.content.res.Configuration(c.getResources().getConfiguration());
        cfg.uiMode = (cfg.uiMode & ~android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                | (t.equals("donker") ? android.content.res.Configuration.UI_MODE_NIGHT_YES
                                      : android.content.res.Configuration.UI_MODE_NIGHT_NO);
        return c.createConfigurationContext(cfg);
    }

    /** Uren dat het venster vanaf nu naar voren is geschoven. */
    static int offsetVan(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("offset" + widgetId, 0);
    }

    static void bewaarOffset(Context c, int widgetId, int uren) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("offset" + widgetId, uren).apply();
    }

    /** Breedte en hoogte van de widget in dp. */
    static float[] maat(Context c, int widgetId) {
        float w = 250, h = 160;
        try {
            Bundle o = AppWidgetManager.getInstance(c).getAppWidgetOptions(widgetId);
            if (o != null) {
                int ow = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                int oh = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
                if (ow > 0) w = ow;
                if (oh > 0) h = oh;
            }
        } catch (Throwable ignored) {
        }
        return new float[]{w, h};
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_SCROLL.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
            int nieuw = intent.getBooleanExtra("reset", false) ? 0
                    : Math.max(Grafiek.MIN_OFFSET, Math.min(Grafiek.MAX_OFFSET, offsetVan(context, id) + intent.getIntExtra("delta", 0)));
            bewaarOffset(context, id, nieuw);
            AppWidgetManager m = AppWidgetManager.getInstance(context);
            RemoteViews pv = new RemoteViews(context.getPackageName(), R.layout.widget);
            pv.setViewVisibility(R.id.nu, nieuw != 0 ? View.VISIBLE : View.GONE);
            m.partiallyUpdateAppWidget(id, pv);
            m.notifyAppWidgetViewDataChanged(id, R.id.lijst);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        final PendingResult klaar = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                for (int id : ids) {
                    try {
                        ververs(app, manager, id);
                    } catch (Throwable t) {
                        toonFout(app, manager, id, t);
                    }
                }
            } finally {
                klaar.finish();
            }
        }).start();
    }

    /** Bij het vergroten of verkleinen: kaart en grafieken opnieuw op maat. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle opts) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                ververs(app, manager, id);
            } catch (Throwable t) {
                toonFout(app, manager, id, t);
            }
        }).start();
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) e.remove("spot" + id).remove("grafiek" + id).remove("offset" + id).remove("thema" + id);
        e.apply();
    }

    /** Een fout in de widget laten we zien in plaats van de app te laten crashen. */
    static void toonFout(Context c, AppWidgetManager manager, int widgetId, Throwable t) {
        try {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
            v.setTextViewText(R.id.naam, "Fout in widget");
            v.setTextViewText(R.id.wind, "–");
            String m = String.valueOf(t.getMessage());
            v.setTextViewText(R.id.vlagen, t.getClass().getSimpleName() + ": " + (m.length() > 90 ? m.substring(0, 90) : m));
            v.setTextViewText(R.id.oordeel, "");
            manager.updateAppWidget(widgetId, v);
        } catch (Throwable ignored) {
        }
    }

    /** Haalt de wind op en tekent één widget. Niet op de hoofdthread aanroepen. */
    static void ververs(Context c, AppWidgetManager manager, int widgetId) {
        String spot = spotVan(c, widgetId);
        final Context t = thema(c, widgetId);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        v.setTextColor(R.id.naam, t.getColor(R.color.tekst));
        v.setTextColor(R.id.wind, t.getColor(R.color.tekst));
        v.setTextColor(R.id.vlagen, t.getColor(R.color.tekst_zwak));
        v.setTextColor(R.id.tandwiel, t.getColor(R.color.tekst_zwak));
        String url = Api.BASIS + "/mobile/" + (spot.isEmpty() ? "" : "?spot=" + Uri.encode(spot));
        try {
            if (spot.isEmpty()) throw new IllegalStateException("geen spot");
            JSONObject d = new JSONObject(Api.haal("/api/widget?spot=" + Uri.encode(spot)));
            v.setTextViewText(R.id.naam, d.optString("name", spot));
            String wind = d.isNull("windKn") ? "–" : d.optInt("windKn") + " kn";
            v.setTextViewText(R.id.wind, wind + " " + pijl(d.isNull("dir") ? -1 : d.optInt("dir")));
            String oordeel = d.isNull("oordeel") ? "" : d.optString("oordeel");
            String reden = d.isNull("reden") ? "" : d.optString("reden");
            String tijd = d.isNull("updatedAt") ? "" : d.optString("updatedAt");
            tijd = tijd.contains("T") ? tijd.substring(tijd.indexOf('T') + 1, Math.min(tijd.length(), tijd.indexOf('T') + 6)) : "";
            StringBuilder regel = new StringBuilder();
            if (!tijd.isEmpty()) regel.append(tijd);
            if (!d.isNull("gustKn")) regel.append(regel.length() > 0 ? " · " : "").append("vlagen ").append(d.optInt("gustKn"));
            // Bij 'nee' of 'bijna' is de reden belangrijker dan de aflandigheid.
            String staart = !reden.isEmpty() && !oordeel.equals("nee") ? reden : (d.isNull("shore") ? "" : d.optString("shore").toLowerCase());
            if (!staart.isEmpty()) regel.append(regel.length() > 0 ? " · " : "").append(staart);
            v.setTextViewText(R.id.vlagen, regel.toString());

            // Oordeel als gekleurd label.
            // Het label zegt zelf wat er aan de hand is: GOED, BIJNA, of de reden (TE WEINIG WIND).
            String pil = oordeel.equals("go") ? "GOED"
                    : oordeel.equals("nee") && !reden.isEmpty() ? reden.toUpperCase()
                    : oordeel.isEmpty() ? "" : oordeel.toUpperCase();
            v.setTextViewText(R.id.oordeel, pil);
            v.setInt(R.id.oordeel, "setBackgroundResource",
                    oordeel.equals("go") ? R.drawable.pil_go : oordeel.equals("bijna") ? R.drawable.pil_bijna
                            : oordeel.isEmpty() ? 0 : R.drawable.pil_nee);
            v.setTextColor(R.id.oordeel, oordeel.equals("nee") ? Color.WHITE : Color.parseColor("#1A2635"));

            // Voor schermlezers: de widget als één zin.
            v.setContentDescription(R.id.kop, d.optString("name", spot) + ", " + (d.isNull("windKn") ? "geen wind" : d.optInt("windKn") + " knopen")
                    + (d.isNull("gustKn") ? "" : ", vlagen " + d.optInt("gustKn"))
                    + (oordeel.isEmpty() ? "" : ", " + oordeel) + (reden.isEmpty() ? "" : ", " + reden)
                    + (tijd.isEmpty() ? "" : ", gemeten om " + tijd));
            if (!d.isNull("url")) url = d.optString("url");

            float[] m = maat(c, widgetId);
            int bw = 540;
            int bh = Math.max(240, Math.min(Math.round(bw * m[1] / m[0]), 1100));
            Bitmap kaart = Kaart.teken(t, spot, d.optDouble("lat", 0), d.optDouble("lon", 0), bw, bh, m[0],
                    d.isNull("windKn") ? null : d.getDouble("windKn"),
                    d.isNull("dir") ? null : d.getInt("dir"),
                    d.isNull("stroomKn") ? null : d.getDouble("stroomKn"),
                    d.isNull("stroomDir") ? null : d.getInt("stroomDir"));
            if (kaart != null) v.setImageViewBitmap(R.id.kaart, kaart);
        } catch (Exception e) {
            v.setTextViewText(R.id.naam, spot.isEmpty() ? "Kies een spot" : "Geen data");
            v.setTextViewText(R.id.wind, "–");
            v.setTextViewText(R.id.vlagen, "");
            v.setTextViewText(R.id.oordeel, "");
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        v.setOnClickPendingIntent(R.id.kop,
                PendingIntent.getActivity(c, widgetId, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // "nu": terug naar het huidige moment, alleen zichtbaar als je het venster hebt verschoven.
        v.setViewVisibility(R.id.nu, offsetVan(c, widgetId) != 0 ? View.VISIBLE : View.GONE);
        v.setTextColor(R.id.nu, t.getColor(R.color.accent));
        v.setOnClickPendingIntent(R.id.nu, PendingIntent.getBroadcast(c, widgetId + 200000,
                new Intent(c, WindWidget.class).setAction(ACTION_SCROLL)
                        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId).putExtra("reset", true),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // Naam en tandwiel openen de instellingen: andere spot, andere standaardgrafiek.
        Intent instel = new Intent(c, ConfigActivity.class).setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        PendingIntent instellen = PendingIntent.getActivity(c, widgetId + 100000, instel,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.naam, instellen);
        v.setOnClickPendingIntent(R.id.tandwiel, instellen);

        // De lijst met grafieken, één per pagina. Een tik links of rechts op een grafiek schuift het
        // venster een halve dag; dat gaat via een broadcast naar deze widget (expliciete intent).
        Intent dienst = new Intent(c, GrafiekService.class);
        dienst.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        dienst.setData(Uri.parse(dienst.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.lijst, dienst);
        Intent scroll = new Intent(c, WindWidget.class).setAction(ACTION_SCROLL);
        v.setPendingIntentTemplate(R.id.lijst, PendingIntent.getBroadcast(c, widgetId, scroll,
                PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        manager.updateAppWidget(widgetId, v);
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.lijst);
    }

    private static int kleur(Context c, String oordeel) {
        switch (oordeel) {
            case "go": return c.getColor(R.color.go);
            case "bijna": return c.getColor(R.color.bijna);
            default: return c.getColor(R.color.nee);
        }
    }

    /** Wind komt UIT deze richting; zelfde pijlen als de Scriptable-widget. */
    private static String pijl(int graden) {
        if (graden < 0) return "";
        String[] p = {"↓", "↙", "←", "↖", "↑", "↗", "→", "↘"};
        return p[Math.round(graden / 45f) % 8];
    }
}
