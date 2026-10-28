package nl.tosurfornottosurf.widget;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

final class Api {
    static final String BASIS = "https://tosurfornottosurf.nl";

    private Api() {}

    /** Haalt een afbeelding (PNG van de server) op. Aanroepen vanaf een achtergrondthread. */
    static Bitmap haalBeeld(String pad) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASIS + pad).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(20_000);
        try (java.io.InputStream in = c.getInputStream()) {
            Bitmap b = BitmapFactory.decodeStream(in);
            if (b == null) throw new java.io.IOException("geen afbeelding");
            return b;
        } finally {
            c.disconnect();
        }
    }

    /** Haalt een URL op als tekst. Aanroepen vanaf een achtergrondthread. */
    static String haal(String pad) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASIS + pad).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
            StringBuilder sb = new StringBuilder();
            String regel;
            while ((regel = r.readLine()) != null) sb.append(regel);
            return sb.toString();
        } finally {
            c.disconnect();
        }
    }
}
