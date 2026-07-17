#!/bin/bash

PROJECT="$(cd "$(dirname "$0")" && pwd)"
URL_FILE="$PROJECT/URL.txt"
LOG="/tmp/cloudflared.log"

# Stop bestaande processen
pkill -f cloudflared 2>/dev/null
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

# Start Cloudflare tunnel
rm -f "$LOG"
nohup cloudflared tunnel --url http://localhost:5000 > "$LOG" 2>&1 &

# Achtergrondproces: zodra URL bekend is, schrijf naar URL.txt
(
    for i in $(seq 1 30); do
        URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1)
        if [ -n "$URL" ]; then
            echo "$URL" > "$URL_FILE"
            echo "App bereikbaar op: $URL"
            break
        fi
        sleep 1
    done
    if [ -z "$URL" ]; then
        echo "Cloudflare URL niet gevonden na 30s, check /tmp/cloudflared.log"
    fi
) &

echo "App wordt opgestart... URL verschijnt zo in URL.txt"
