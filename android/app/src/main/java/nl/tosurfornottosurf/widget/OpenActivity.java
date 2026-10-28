package nl.tosurfornottosurf.widget;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Ontvangt de tik op een grafiek (met de spot-URL als data) en opent die in de browser of PWA.
 *  Nodig omdat een aanpasbare PendingIntent sinds Android 14 een expliciete intent vraagt. */
public class OpenActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (getIntent().getData() != null) {
            startActivity(new Intent(Intent.ACTION_VIEW, getIntent().getData()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        finish();
    }
}
