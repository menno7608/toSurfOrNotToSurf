package nl.tosurfornottosurf.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Ontvangt de uitkomst van de installatie; vraagt zo nodig om bevestiging van de gebruiker. */
public class InstallResultaat extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent vraag = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (vraag != null) c.startActivity(vraag.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
