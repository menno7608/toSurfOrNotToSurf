import os
import json
import requests
from datetime import datetime
from dotenv import load_dotenv
from pushbullet import Pushbullet

# Laad API-sleutels uit .env
load_dotenv()
OWM_API_KEY = os.getenv("OWM_API_KEY")
PB_TOKEN = os.getenv("PUSHBULLET_TOKEN")

# Laad spotsconfiguratie (alleen spots met kite-drempelwaarden)
with open("spots.json") as f:
    spots = [s for s in json.load(f) if "min_wind" in s and "max_wind" in s]

# Init Pushbullet
pb = Pushbullet(PB_TOKEN)

def get_wind(lat, lon):
    """Haalt windgegevens op van OpenWeatherMap One Call API."""
    url = (
        f"https://api.openweathermap.org/data/3.0/onecall"
        f"?lat={lat}&lon={lon}&exclude=minutely,hourly,daily,alerts"
        f"&units=metric&appid={OWM_API_KEY}"
    )
    try:
        resp = requests.get(url)
        resp.raise_for_status()
        data = resp.json()
        return data["current"]["wind_speed"], data["current"]["wind_deg"]
    except Exception as e:
        print(f"[ERROR] API call failed: {e}")
        return None, None

def check_spots():
    """Checkt alle spots en stuurt alerts bij geschikte condities."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    for spot in spots:
        speed, deg = get_wind(spot["lat"], spot["lon"])
        if speed is None:
            continue
        print(f"{spot['name']}: wind {speed:.1f} m/s ({deg}°)")

        if spot["min_wind"] <= speed <= spot["max_wind"]:
            msg = (
                f"Kitespot: {spot['name']}\n"
                f"Wind: {speed:.1f} m/s uit {deg}° ✅\n"
                f"{now}"
            )
            pb.push_note(f"Kite Alert – {spot['name']}", msg)
            print(f"[ALERT] {spot['name']} – notificatie verzonden.")

if __name__ == "__main__":
    check_spots()
