package nl.tosurfornottosurf.widget;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private TextView status;
    private Button update;
    private long nieuwste = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout kolom = new LinearLayout(this);
        kolom.setOrientation(LinearLayout.VERTICAL);
        kolom.setPadding(48, 96, 48, 48);

        TextView uitleg = new TextView(this);
        uitleg.setTextSize(18);
        uitleg.setText("Zo zet je de wind-widget op je beginscherm:\n\n"
                + "1. Houd een lege plek op je beginscherm ingedrukt.\n"
                + "2. Kies Widgets.\n"
                + "3. Kies toSurfOrNotToSurf en sleep de widget naar je scherm.\n"
                + "4. Kies je spot.");
        kolom.addView(uitleg);

        Button site = new Button(this);
        site.setText("Open toSurfOrNotToSurf");
        site.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASIS + "/mobile/"))));
        kolom.addView(site);

        status = new TextView(this);
        status.setTextSize(15);
        status.setPadding(0, 48, 0, 12);
        kolom.addView(status);

        update = new Button(this);
        update.setText("Zoek update");
        update.setOnClickListener(v -> zoekUpdate());
        kolom.addView(update);

        setContentView(kolom);
        status.setText("Versie " + eigenVersie());
        zoekUpdate();
    }

    private long eigenVersie() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    /** Vraagt de site welke versie de nieuwste is en toont de updateknop als die nieuwer is. */
    private void zoekUpdate() {
        status.setText("Versie " + eigenVersie() + " · zoeken naar update…");
        new Thread(() -> {
            try {
                nieuwste = new JSONObject(Api.haal("/mobile/widget/versie.json")).getLong("versionCode");
                runOnUiThread(() -> {
                    if (nieuwste > eigenVersie()) {
                        status.setText("Versie " + eigenVersie() + " · er is een nieuwe versie (" + nieuwste + ").");
                        update.setText("Update installeren");
                        update.setOnClickListener(v -> installeer());
                    } else {
                        status.setText("Versie " + eigenVersie() + " · je hebt de nieuwste versie.");
                        update.setText("Zoek update");
                        update.setOnClickListener(v -> zoekUpdate());
                    }
                });
            } catch (Throwable e) {
                runOnUiThread(() -> status.setText("Versie " + eigenVersie() + " · geen verbinding om te controleren."));
            }
        }).start();
    }

    /** Haalt de nieuwe APK op en installeert hem over de huidige heen. */
    private void installeer() {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            status.setText("Sta eerst toe dat deze app updates installeert, en tik daarna opnieuw op Update installeren.");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        status.setText("Update downloaden…");
        update.setEnabled(false);
        new Thread(() -> {
            try {
                PackageInstaller pi = getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                int id = pi.createSession(params);
                try (PackageInstaller.Session sessie = pi.openSession(id)) {
                    HttpURLConnection c = (HttpURLConnection) new URL(Api.BASIS + "/mobile/widget/tosurfornottosurf.apk?v=" + nieuwste).openConnection();
                    c.setConnectTimeout(10_000);
                    c.setReadTimeout(30_000);
                    try (InputStream in = c.getInputStream(); OutputStream uit = sessie.openWrite("update", 0, -1)) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) uit.write(buf, 0, n);
                        sessie.fsync(uit);
                    } finally {
                        c.disconnect();
                    }
                    PendingIntent klaar = PendingIntent.getBroadcast(this, id, new Intent(this, InstallResultaat.class),
                            PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    sessie.commit(klaar.getIntentSender());
                }
                runOnUiThread(() -> status.setText("Update wordt geïnstalleerd…"));
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    status.setText("Update mislukt: " + e.getClass().getSimpleName());
                    update.setEnabled(true);
                });
            }
        }).start();
    }
}
