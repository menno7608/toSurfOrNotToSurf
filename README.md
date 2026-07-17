# KustRadar 🌊

**Live wind- en golfcondities voor kite- en surfers langs de Nederlandse kust.**

KustRadar toont actuele windsnelheid, windrichting, windstoten, golfhoogte, lucht- en watertemperatuur voor meer dan 20 strandlocaties — van Cadzand tot Makkum. Gebouwd om op een Raspberry Pi als muurscherm te draaien, maar ook gewoon in elke browser te openen.

---

## Opstarten

### Snelste manier (production)

```bash
cd ~/Documents/raspberry-weather-screen/backend
source .venv/bin/activate
python app.py
```

Open dan **http://localhost:5000** in je browser.

### Development (met live frontend reload)

**Terminal 1 — backend:**
```bash
cd ~/Documents/raspberry-weather-screen/backend
source .venv/bin/activate
python app.py
```

**Terminal 2 — frontend:**
```bash
cd ~/Documents/raspberry-weather-screen/frontend
npm run dev
```

Open dan **http://localhost:5173**

---

## Eerste keer installeren

```bash
# Backend
cd ~/Documents/raspberry-weather-screen/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend bouwen
cd ~/Documents/raspberry-weather-screen/frontend
npm install
npm run build
```

---

## Frontend opnieuw bouwen na aanpassingen

```bash
cd ~/Documents/raspberry-weather-screen/frontend
npm run build
```

De build wordt automatisch in `backend/static/app/` gezet en door Flask geserveerd.

---

## Databronnen

| Data | Bron |
|------|------|
| Wind & temperatuur | [Open-Meteo](https://open-meteo.com) |
| Golven & watertemperatuur | [Open-Meteo Marine](https://marine-api.open-meteo.com) |
| Gemeten winddata kust | [KNMI Uurgegevens](https://www.knmi.nl) |

Geen API-sleutels nodig — alles is gratis en open.

---

## Locaties

Noord-Holland · Zuid-Holland · Zeeland · IJsselmeer · Marokko (Essaouira)

---

## Techniek

- **Backend:** Python · Flask · Open-Meteo API · KNMI API
- **Frontend:** React · Vite · Recharts
- **Hardware:** Raspberry Pi (als muurscherm)
