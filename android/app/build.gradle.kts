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
        versionCode = 1
        versionName = "1.0"
    }

    // Vaste sleutel, zodat een nieuwe versie over de oude heen geïnstalleerd kan worden.
    // De widget toont alleen openbare weerdata; de sleutel hoeft dus niet geheim te zijn.
    signingConfigs {
        create("widget") {
            storeFile = file("../widget.keystore")
            storePassword = "tosurf-widget"
            keyAlias = "widget"
            keyPassword = "tosurf-widget"
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
