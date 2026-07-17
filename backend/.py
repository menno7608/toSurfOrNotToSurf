from flask import Flask, render_template, jsonify
from datetime import datetime, timezone

app = Flask(__name__, static_folder="static", template_folder="templates")

@app.route("/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/api/spots")
def get_spots():
    now = datetime.now(timezone.utc).isoformat()

    spots = [
        {
            "id": "wijk-aan-zee",
            "name": "Wijk aan Zee",
            "updatedAt": now,
            "location": {"lat": 52.493, "lon": 4.596},

            # “live” blok voor SpotInfo
            "live": {
                "windSpeed": 11.2,      # m/s
                "windGust": 15.8,       # m/s
                "windDir": 240,         # graden
                "waveHeight": 1.4,      # m
                "wavePeriod": 7.2,      # s
                "tide": 0.5             # m (relatief / dummy)
            },

            # arrays voor charts (tijd + waarde)
            "windPast": [
                {"t": "18:00", "v": 9.5},
                {"t": "19:00", "v": 10.2},
                {"t": "20:00", "v": 11.0},
                {"t": "21:00", "v": 11.2},
            ],
            "windLive": [
                {"t": "21:00", "v": 11.2}
            ],
            "windForecast": [
                {"t": "22:00", "v": 12.0},
                {"t": "23:00", "v": 12.6},
                {"t": "00:00", "v": 12.1},
            ],
            "marine": [
                {"t": "18:00", "hs": 1.1, "tp": 6.5},
                {"t": "19:00", "hs": 1.2, "tp": 6.8},
                {"t": "20:00", "hs": 1.3, "tp": 7.0},
                {"t": "21:00", "hs": 1.4, "tp": 7.2},
            ]
        }
    ]
    return jsonify(spots)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
