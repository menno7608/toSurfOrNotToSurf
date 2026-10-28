plugins {
    id("com.android.application")
}

android {
    namespace = "nl.tosurfornottosurf.widget"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.tosurfornottosurf.widget"
        minSdk = 26
        targetSdk = 34
        // Het CI-runnummer is het versienummer; frontend/mobile-public/widget/versie.json noemt de nieuwste.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionName = "1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // Vaste sleutel, zodat een nieuwe versie over de oude heen geïnstalleerd kan worden.
    // In CI komt de sleutel uit GitHub-geheimen (WIDGET_KEYSTORE_PASSWORD + widget.p12); zonder
    // die geheimen valt de bouw terug op de oude sleutel in de repo (zie android/maak-sleutel.sh).
    val geheim = System.getenv("WIDGET_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }
    signingConfigs {
        create("widget") {
            if (geheim != null) {
                storeFile = file("../widget.p12")
                storeType = "pkcs12"
                storePassword = geheim
                keyPassword = geheim
            } else {
                storeFile = file("../widget.keystore")
                storePassword = "tosurf-widget"
                keyPassword = "tosurf-widget"
            }
            keyAlias = "widget"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("widget")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
