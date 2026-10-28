package nl.tosurfornottosurf.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;

/** Opent bij het toevoegen van de widget: kies de spot. */
public class ConfigActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final List<String> ids = new ArrayList<>();
    private final List<String> namen = new ArrayList<>();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        TextView laden = new TextView(this);
        laden.setText("Spots laden…");
        laden.setTextSize(18);
        laden.setPadding(48, 96, 48, 48);
        setContentView(laden);

        new Thread(() -> {
            try {
                JSONArray a = new JSONArray(Api.haal("/api/widget-spots"));
                for (int i = 0; i < a.length(); i++) {
                    ids.add(a.getJSONObject(i).getString("id"));
                    namen.add(a.getJSONObject(i).getString("name"));
                }
                runOnUiThread(this::toonLijst);
            } catch (Exception e) {
                runOnUiThread(() -> laden.setText("Geen verbinding. Probeer het later opnieuw."));
            }
        }).start();
    }

    private void toonLijst() {
        ListView lijst = new ListView(this);
        lijst.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, namen));
        lijst.setOnItemClickListener((p, v, pos, id) -> kiesGrafiek(ids.get(pos)));
        setContentView(lijst);
    }

    /** Tweede stap: welke grafiek staat bovenaan. Wind is de standaard. */
    private void kiesGrafiek(String spotId) {
        TextView kop = new TextView(this);
        kop.setText("Standaard grafiek");
        kop.setTextSize(18);
        kop.setPadding(48, 48, 48, 24);
        ListView lijst = new ListView(this);
        lijst.addHeaderView(kop, null, false);
        lijst.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, Grafiek.NAMEN));
        lijst.setOnItemClickListener((p, v, pos, id) -> {
            int i = pos - lijst.getHeaderViewsCount();
            if (i >= 0) kies(spotId, Grafiek.SOORTEN[i]);
        });
        setContentView(lijst);
    }

    private void kies(String spotId, String grafiek) {
        WindWidget.bewaarGrafiek(this, widgetId, grafiek);
        WindWidget.bewaarSpot(this, widgetId, spotId);
        final AppWidgetManager m = AppWidgetManager.getInstance(this);
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            WindWidget.ververs(app, m, widgetId);
            Intent r = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            setResult(RESULT_OK, r);
            finish();
        }).start();
    }
}
