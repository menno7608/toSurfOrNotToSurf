package nl.tosurfornottosurf.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class WindWidget extends AppWidgetProvider {
    static final String PREFS = "widget";

    static String spotVan(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("spot" + widgetId, "");
    }

    static void bewaarSpot(Context c, int widgetId, String spotId) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("spot" + widgetId, spotId).apply();
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        final PendingResult klaar = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                for (int id : ids) ververs(app, manager, id);
            } finally {
                klaar.finish();
            }
        }).start();
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) e.remove("spot" + id);
        e.apply();
    }

    /** Haalt de wind op en tekent één widget. Niet op de hoofdthread aanroepen. */
    static void ververs(Context c, AppWidgetManager manager, int widgetId) {
        String spot = spotVan(c, widgetId);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        String url = Api.BASIS + "/mobile/" + (spot.isEmpty() ? "" : "?spot=" + Uri.encode(spot));
        try {
            if (spot.isEmpty()) throw new IllegalStateException("geen spot");
            JSONObject d = new JSONObject(Api.haal("/api/widget?spot=" + Uri.encode(spot)));
            v.setTextViewText(R.id.naam, d.optString("name", spot));
            String wind = d.isNull("windKn") ? "–" : d.optInt("windKn") + " kn";
            v.setTextViewText(R.id.wind, wind + " " + pijl(d.isNull("dir") ? -1 : d.optInt("dir")));
            String vlagen = d.isNull("gustKn") ? "" : "vlagen " + d.optInt("gustKn");
            if (!d.isNull("shore")) vlagen += (vlagen.isEmpty() ? "" : " · ") + d.optString("shore").toLowerCase();
            v.setTextViewText(R.id.vlagen, vlagen);
            String oordeel = d.isNull("oordeel") ? "" : d.optString("oordeel");
            v.setTextViewText(R.id.oordeel, oordeel.isEmpty() ? "geen oordeel" : oordeel.toUpperCase());
            v.setTextColor(R.id.oordeel, kleur(oordeel));
            if (!d.isNull("url")) url = d.optString("url");
        } catch (Exception e) {
            v.setTextViewText(R.id.naam, spot.isEmpty() ? "Kies een spot" : "Geen data");
            v.setTextViewText(R.id.wind, "–");
            v.setTextViewText(R.id.vlagen, "");
            v.setTextViewText(R.id.oordeel, "");
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        v.setOnClickPendingIntent(R.id.wortel,
                PendingIntent.getActivity(c, widgetId, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        manager.updateAppWidget(widgetId, v);
    }

    private static int kleur(String oordeel) {
        switch (oordeel) {
            case "go": return Color.parseColor("#2ECC71");
            case "bijna": return Color.parseColor("#F5A623");
            default: return Color.parseColor("#8A96A3");
        }
    }

    /** Wind komt UIT deze richting; zelfde pijlen als de Scriptable-widget. */
    private static String pijl(int graden) {
        if (graden < 0) return "";
        String[] p = {"↓", "↙", "←", "↖", "↑", "↗", "→", "↘"};
        return p[Math.round(graden / 45f) % 8];
    }
}
