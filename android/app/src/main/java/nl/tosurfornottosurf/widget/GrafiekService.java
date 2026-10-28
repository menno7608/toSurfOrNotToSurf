package nl.tosurfornottosurf.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Levert de scrolbare lijst met grafieken voor één widget. */
public class GrafiekService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        return new Fabriek(getApplicationContext(), id);
    }

    private static final class Fabriek implements RemoteViewsFactory {
        private final Context c;
        private final int widgetId;
        private final List<String> titels = new ArrayList<>();
        private final List<Bitmap> beelden = new ArrayList<>();
        private String url = Api.BASIS + "/mobile/";

        Fabriek(Context c, int widgetId) {
            this.c = c;
            this.widgetId = widgetId;
        }

        @Override public void onCreate() {}

        /** Draait op een achtergrondthread: hier mag het netwerk. */
        @Override
        public void onDataSetChanged() {
            titels.clear();
            beelden.clear();
            String spot = WindWidget.spotVan(c, widgetId);
            if (spot.isEmpty()) return;
            url = Api.BASIS + "/mobile/?spot=" + Uri.encode(spot);
            try {
                JSONObject d = new JSONObject(Api.haal("/api/widget-grafiek?spot=" + Uri.encode(spot)));
                String standaard = WindWidget.standaardGrafiek(c, widgetId);
                List<String> volgorde = new ArrayList<>();
                volgorde.add(standaard);
                for (String s : Grafiek.SOORTEN) if (!s.equals(standaard)) volgorde.add(s);
                for (String soort : volgorde) {
                    if (!Grafiek.heeft(d, soort)) continue;
                    titels.add(Grafiek.naam(soort));
                    beelden.add(Grafiek.teken(c, d, soort));
                }
            } catch (Throwable e) {
                titels.clear();
                beelden.clear();
            }
        }

        @Override public void onDestroy() { titels.clear(); beelden.clear(); }
        @Override public int getCount() { return beelden.size(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.grafiek_item);
            if (pos < beelden.size()) {
                v.setTextViewText(R.id.grafiek_titel, titels.get(pos));
                v.setImageViewBitmap(R.id.grafiek_beeld, beelden.get(pos));
                v.setOnClickFillInIntent(R.id.grafiek_wortel, new Intent().setData(Uri.parse(url)));
            }
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return true; }
    }
}
