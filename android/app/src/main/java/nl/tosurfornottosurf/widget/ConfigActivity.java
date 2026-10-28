package nl.tosurfornottosurf.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
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

    private final List<String> zichtIds = new ArrayList<>();
    private final List<String> zichtNamen = new ArrayList<>();
    private ArrayAdapter<String> adapter;

    /** Eerste stap: kies de spot, met een zoekbalk bovenaan om te typen. */
    private void toonLijst() {
        LinearLayout kolom = new LinearLayout(this);
        kolom.setOrientation(LinearLayout.VERTICAL);

        EditText zoek = new EditText(this);
        zoek.setHint("Zoek een spot…");
        zoek.setSingleLine(true);
        zoek.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        zoek.setPadding(48, 40, 48, 40);
        kolom.addView(zoek, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        ListView lijst = new ListView(this);
        adapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, zichtNamen);
        lijst.setAdapter(adapter);
        lijst.setOnItemClickListener((p, v, pos, id) -> kiesGrafiek(zichtIds.get(pos)));
        kolom.addView(lijst, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        zoek.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable e) { filter(e.toString()); }
        });
        filter("");
        setContentView(kolom);
    }

    private void filter(String zoek) {
        String q = zoek.trim().toLowerCase();
        zichtIds.clear();
        zichtNamen.clear();
        for (int i = 0; i < namen.size(); i++) {
            if (q.isEmpty() || namen.get(i).toLowerCase().contains(q)) {
                zichtIds.add(ids.get(i));
                zichtNamen.add(namen.get(i));
            }
        }
        if (adapter != null) adapter.notifyDataSetChanged();
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
            if (i >= 0) kiesThema(spotId, Grafiek.SOORTEN[i]);
        });
        setContentView(lijst);
    }

    /** Derde stap: licht, donker of het thema van je telefoon volgen. */
    private void kiesThema(String spotId, String grafiek) {
        final String[] namenT = {"Automatisch (volgt je telefoon)", "Licht", "Donker"};
        final String[] waarden = {"auto", "licht", "donker"};
        TextView kop = new TextView(this);
        kop.setText("Thema");
        kop.setTextSize(18);
        kop.setPadding(48, 48, 48, 24);
        ListView lijst = new ListView(this);
        lijst.addHeaderView(kop, null, false);
        lijst.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, namenT));
        lijst.setOnItemClickListener((p, v, pos, id) -> {
            int i = pos - lijst.getHeaderViewsCount();
            if (i >= 0) kies(spotId, grafiek, waarden[i]);
        });
        setContentView(lijst);
    }

    private void kies(String spotId, String grafiek, String thema) {
        WindWidget.bewaarThema(this, widgetId, thema);
        WindWidget.bewaarGrafiek(this, widgetId, grafiek);
        WindWidget.bewaarSpot(this, widgetId, spotId);
        WindWidget.bewaarOffset(this, widgetId, 0); // opnieuw beginnen bij nu
        final AppWidgetManager m = AppWidgetManager.getInstance(this);
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            try {
                WindWidget.ververs(app, m, widgetId);
            } catch (Throwable t) {
                WindWidget.toonFout(app, m, widgetId, t);
            }
            Intent r = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            setResult(RESULT_OK, r);
            finish();
        }).start();
    }
}
