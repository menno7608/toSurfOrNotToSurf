package nl.tosurfornottosurf.widget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
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
        setContentView(kolom);
    }
}
