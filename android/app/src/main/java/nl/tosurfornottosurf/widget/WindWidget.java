package nl.tosurfornottosurf.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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

    static String standaardGrafiek(Context c, int widgetId) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("grafiek" + widgetId, "wind");
    }

    static void bewaarGrafiek(Context c, int widgetId, String soort) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("grafiek" + widgetId, soort).apply();
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
        for (int id : ids) e.remove("spot" + id).remove("grafiek" + id);
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
            v.setTextColor(R.id.oordeel, kleur(c, oordeel));
            if (!d.isNull("url")) url = d.optString("url");
            if (!d.isNull("lat") && !d.isNull("lon")) {
                android.graphics.Bitmap kaart = Kaart.teken(c, spot, d.getDouble("lat"), d.getDouble("lon"));
                if (kaart != null) v.setImageViewBitmap(R.id.kaart, kaart);
            }
        } catch (Exception e) {
            v.setTextViewText(R.id.naam, spot.isEmpty() ? "Kies een spot" : "Geen data");
            v.setTextViewText(R.id.wind, "–");
            v.setTextViewText(R.id.vlagen, "");
            v.setTextViewText(R.id.oordeel, "");
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        v.setOnClickPendingIntent(R.id.kop,
                PendingIntent.getActivity(c, widgetId, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // De scrolbare lijst met grafieken; een tik op een grafiek opent de app op deze spot.
        Intent dienst = new Intent(c, GrafiekService.class);
        dienst.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        dienst.setData(Uri.parse(dienst.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.lijst, dienst);
        v.setPendingIntentTemplate(R.id.lijst, PendingIntent.getActivity(c, widgetId,
                new Intent(Intent.ACTION_VIEW), PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
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
