package nl.tosurfornottosurf.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Levert de scrolbare lijst met grafieken voor één widget: één grafiek per pagina. */
public class GrafiekService extends RemoteViewsService {
    static final int B = 640;

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        return new Fabriek(getApplicationContext(), id);
    }

    private static final class Fabriek implements RemoteViewsFactory {
        private final Context c;
        private final int widgetId;
        private final List<Bitmap> beelden = new ArrayList<>();
        private final List<String> soorten = new ArrayList<>();
        private String url = Api.BASIS + "/mobile/";

        Fabriek(Context c, int widgetId) {
            this.c = c;
            this.widgetId = widgetId;
        }

        @Override public void onCreate() {}

        /** Hoogte van één grafiek in bitmap-pixels, zodat hij precies de lijst vult. */
        private int hoogte() {
            float[] m = WindWidget.maat(c, widgetId);
            float lijstB = m[0] - 2 * WindWidget.PADDING_H_DP;
            float lijstH = m[1] - 2 * WindWidget.PADDING_V_DP - WindWidget.KOP_DP;
            int h = Math.round(B * lijstH / lijstB);
            return Math.max(150, Math.min(h, 900));
        }

        /** Draait op een achtergrondthread: hier mag het netwerk. */
        @Override
        public void onDataSetChanged() {
            beelden.clear();
            soorten.clear();
            String spot = WindWidget.spotVan(c, widgetId);
            if (spot.isEmpty()) return;
            url = Api.BASIS + "/mobile/?spot=" + Uri.encode(spot);
            try {
                JSONObject d = new JSONObject(Api.haal("/api/widget?spot=" + Uri.encode(spot)));
                org.json.JSONArray ok = d.optJSONArray("grafieken");
                String standaard = WindWidget.standaardGrafiek(c, widgetId);
                List<String> volgorde = new ArrayList<>();
                volgorde.add(standaard);
                for (String s : Grafiek.SOORTEN) if (!s.equals(standaard)) volgorde.add(s);
                int offset = WindWidget.offsetVan(c, widgetId);
                int h = hoogte();
                String thema = WindWidget.themaNaam(c, widgetId);
                for (String soort : volgorde) {
                    if (ok != null && !bevat(ok, soort)) continue;
                    // De server tekent de grafiek; hier wordt alleen de afbeelding getoond.
                    beelden.add(Api.haalBeeld("/api/widget-beeld?spot=" + Uri.encode(spot) + "&soort=" + soort
                            + "&thema=" + thema + "&offset=" + offset + "&w=" + B + "&h=" + h));
                    soorten.add(soort);
                }
            } catch (Throwable e) {
                beelden.clear();
            }
        }

        private static boolean bevat(org.json.JSONArray a, String s) {
            for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
            return false;
        }

        @Override public void onDestroy() { beelden.clear(); }
        @Override public int getCount() { return beelden.size(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.grafiek_item);
            if (pos < beelden.size()) {
                v.setImageViewBitmap(R.id.grafiek_beeld, beelden.get(pos));
                v.setContentDescription(R.id.grafiek_beeld, "Grafiek " + Grafiek.naam(soorten.get(pos)).toLowerCase() + ", 24 uur rond nu. Tik rechts voor later, links voor eerder.");
                v.setOnClickFillInIntent(R.id.grafiek_links, scroll(-Grafiek.STAP));
                v.setOnClickFillInIntent(R.id.grafiek_rechts, scroll(Grafiek.STAP));
            }
            return v;
        }

        private Intent scroll(int delta) {
            return new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId).putExtra("delta", delta);
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return true; }
    }
}
