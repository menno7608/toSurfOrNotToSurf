package nl.tosurfornottosurf.widget;

/** De grafiekmogelijkheden en hun grenzen. Het tekenen zelf gebeurt op de server
 *  (backend/widgetbeeld.py), zodat een ontwerpverbetering geen nieuwe installatie vraagt. */
final class Grafiek {
    static final String[] SOORTEN = {"wind", "regen", "golven", "getij", "stroom"};
    static final String[] NAMEN = {"Wind", "Regen", "Golven", "Getij", "Stroming"};

    static final int STAP = 12;          // uren per tik
    static final int MIN_OFFSET = -36;   // verste stap het verleden in
    static final int MAX_OFFSET = 132;   // verste stap de toekomst in

    private Grafiek() {}

    static String naam(String soort) {
        for (int i = 0; i < SOORTEN.length; i++) if (SOORTEN[i].equals(soort)) return NAMEN[i];
        return soort;
    }
}
