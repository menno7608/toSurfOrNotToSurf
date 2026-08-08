#!/bin/bash

PROJECT="$(cd "$(dirname "$0")" && pwd)"
URL_FILE="$PROJECT/URL.txt"
LOG="/tmp/cloudflared.log"

# In productie draaien backend en tunnel als systemd-units. Dit script is de
# handmatige route ernaast en zou die twee omleggen: het startte een eigen
# server op poort 5000 en een eigen tunnel. Sinds de tunnel een vaste
# hostname bedient (tosurfornottosurf.nl) is dat geen ongemak meer maar een
# storing, dus hier wordt eerst gekeken of de diensten al draaien.
if systemctl is-active --quiet weather-dashboard.service; then
    echo "weather-dashboard.service draait al — deze backend wordt beheerd door systemd."
    echo "Herstarten:      sudo systemctl restart weather-dashboard.service"
    echo "Code herladen:   kill -HUP \$(pgrep -f gunicorn | head -1)"
    exit 1
fi

# Stop bestaande processen. NIET cloudflared: de tunnel is een aparte dienst
# (cloudflared.service) met een vaste hostname. Die hoort niet bij het starten
# van de backend te worden omgelegd.
pkill -f "python app.py" 2>/dev/null

# Wacht tot poort 5000 echt vrij is (max 10s)
for i in $(seq 1 10); do
    if ! lsof -ti:5000 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Forceer kill als poort nog steeds bezet is
PIDS=$(lsof -ti:5000 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "Poort 5000 nog bezet, forceer kill..."
    echo "$PIDS" | xargs kill -9 2>/dev/null
    sleep 1
fi

# Bouw frontend als build ontbreekt
REACT_BUILD="$PROJECT/backend/static/app/index.html"
if [ ! -f "$REACT_BUILD" ]; then
    echo "Frontend bouwen..."
    cd "$PROJECT/frontend"
    npm run build
fi

# Start Flask
cd "$PROJECT/backend"
source .venv/bin/activate
nohup python app.py > /tmp/flask.log 2>&1 &
echo "Flask gestart (log: /tmp/flask.log)"

# De tunnel wordt hier niet meer gestart. Tot 8 augustus 2026 draaide hier een
# quick tunnel (`cloudflared tunnel --url`), die bij elke start een nieuwe
# trycloudflare-URL kreeg; die werd uit het log gevist en in URL.txt gezet.
# Inmiddels bedient cloudflared.service een named tunnel op een vaste hostname,
# dus is er niets meer te vissen en zou een tweede tunnel alleen verwarring
# geven.
echo "App wordt opgestart op http://localhost:5000"
echo "Publiek adres: $(cat "$URL_FILE" 2>/dev/null || echo 'zie URL.txt')"
echo "Tunnel:        systemctl status cloudflared.service"
