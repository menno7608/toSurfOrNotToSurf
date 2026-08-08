# Weather Dashboard — toSurfOrNotToSurf 🌊

**Live wind-, golf-, stromings- en getijdecondities voor kite- en surfspots.**

Een full-stack weerdashboard voor surf- en kitesurfspots, gebouwd om op een Raspberry Pi als muurscherm te draaien — maar net zo goed in elke browser (desktop én mobiel) te openen. Het toont per spot actuele en voorspelde condities met scrollbare grafieken tot ~10 dagen vooruit.

**61 spots** langs de Nederlandse kust en het IJsselmeer, plus een aantal buitenlandse spots (Borkum & Norddeich in Duitsland, Essaouira/Moulay/Dakhla in Marokko, Tarifa in Spanje, Bonaire).

---

## Functies

- **Wind** — snelheid, richting, windstoten (verleden · live · verwachting)
- **Current** — stromingssnelheid en -richting
- **Waves** — golfhoogte, swell-hoogte en swell-periode met kwaliteitsindicatie
- **Tide** — getij (zeeniveau t.o.v. MSL) met stijgend/dalend-indicator
- **Rain** — neerslag via Buienradar
- Scrollbare grafieken tot **~10 dagen** vooruit (marine-data 3-uurlijks)
- **Webcams** per spot (embedded live streams waar beschikbaar)
- **Alarmen** — meldingen bij gewenste wind-/golfcondities
- **Weermodel-keuze** per spot (best_match, ECMWF, GFS, ICON, KNMI Harmonie, Météo-France) met pin-functie
- Aparte layouts voor **desktop** en **mobiel**

---

## Databronnen

| Data | Bron | Key nodig? |
|------|------|-----------|
| Wind, temperatuur, weer | [Open-Meteo](https://open-meteo.com) | nee |
| Golven, stroming, getij, watertemperatuur | [Open-Meteo Marine](https://marine-api.open-meteo.com) | nee |
| Neerslag (NL) | [Buienradar](https://www.buienradar.nl) | nee |
| Gemeten winddata kust | [KNMI Uurgegevens](https://www.knmi.nl) | nee |
| NL windverwachting (hi-res) | [KNMI Harmonie-Arome](https://developer.dataplatform.knmi.nl) | ja (gratis) |

De basisfunctionaliteit werkt out-of-the-box op Open-Meteo — **zonder API-sleutels**. KNMI Harmonie (en optioneel OpenWeatherMap / Pushbullet voor alarmen) vereisen een gratis key; zie [Configuratie](#configuratie).

---

## Techniek

- **Backend:** Python · Flask (via Gunicorn) — `backend/app.py`, met `spots.json` als één bron van truth
- **Frontend:** React · Vite · Tailwind · Recharts
- **Caching:** in-memory + disk (`cache.json`), TTL 30 min per spot
- **Hardware/infra:** Raspberry Pi als muurscherm, Cloudflare Tunnel

---

## Eerste keer installeren

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # vul optionele keys in (zie hieronder)

# Frontend bouwen
cd ../frontend
npm install
npm run build               # output gaat naar backend/static/app/
```

## Opstarten

**Productie:**
```bash
cd backend
source .venv/bin/activate
python app.py               # of via de gunicorn/systemd-unit
```
Open **http://localhost:5000**.

**Development (live frontend reload):**
```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate && python app.py
# Terminal 2 — frontend
cd frontend && npm run dev
```
Open **http://localhost:5173**.

### Telefoon-app (PWA)

De installeerbare telefoon-app heeft een eigen build en route; de bestaande desktop-build op `/` blijft apart:

```bash
cd frontend && npm run build:mobile
```

Open daarna **`https://<dashboard-host>/mobile/`**. Installeer op Android via
Chrome → **App installeren** en op iPhone via Safari → **Deel** → **Zet op beginscherm**.

De mobile build staat bewust los van de desktopbuild en kan later als bron dienen
voor een Capacitor Android-shell. Een Android-beginschermwidget wordt vervolgens
als native AppWidget toegevoegd; een PWA alleen kan zo'n widget niet aanbieden.

## Frontend opnieuw bouwen na aanpassingen

```bash
cd frontend && npm run build
```
De build wordt in `backend/static/app/` gezet en door Flask geserveerd.

---

## Configuratie

Kopieer `backend/.env.example` naar `backend/.env` en vul in wat je nodig hebt (allemaal optioneel):

| Variabele | Waarvoor |
|-----------|----------|
| `KNMI_API_KEY` | KNMI Harmonie-Arome hi-res windverwachting (NL-spots) |
| `OWM_API_KEY` | OpenWeatherMap (kite-alert script) |
| `PUSHBULLET_TOKEN` | Push-meldingen voor `kite_alert.py` |

`backend/.env` staat in `.gitignore` en wordt nooit gecommit. `backend/.venv/`, `node_modules/` en `cache.json` evenmin.

---

## Spot toevoegen

Zie [`addSpots.md`](addSpots.md): voeg een regel toe aan `backend/spots.json` (`id`, `name`, `lat`, `lon`, optioneel `shore_angle`, `min_wind`, `max_wind`, `webcam`), herbouw de frontend en herstart de backend.

---

*Persoonlijk project — gebouwd voor eigen gebruik als kiter/windsurfer/golfsurfer.*
