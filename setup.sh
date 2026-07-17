#!/bin/bash
set -e

PROJECT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$PROJECT/backend"
FRONTEND="$PROJECT/frontend"

echo "=== Weather Dashboard Setup ==="
echo "Project: $PROJECT"
echo ""

# Check vereisten
check() {
    if ! command -v "$1" &>/dev/null; then
        echo "FOUT: '$1' niet gevonden. Installeer het eerst."
        exit 1
    fi
}
check python3
check node
check npm

# .env aanmaken als die nog niet bestaat
if [ ! -f "$BACKEND/.env" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    echo ">>> .env aangemaakt vanuit .env.example"
    echo "    Vul je API-sleutels in: $BACKEND/.env"
    echo ""
fi

# Python venv
if [ ! -d "$BACKEND/.venv" ]; then
    echo ">>> Python venv aanmaken..."
    python3 -m venv "$BACKEND/.venv"
fi

echo ">>> Python dependencies installeren..."
"$BACKEND/.venv/bin/pip" install --quiet --upgrade pip
"$BACKEND/.venv/bin/pip" install --quiet -r "$BACKEND/requirements.txt"

# Frontend bouwen
echo ">>> Frontend dependencies installeren..."
cd "$FRONTEND"
npm install --silent

echo ">>> Frontend bouwen..."
npm run build

# Systemd service (optioneel)
echo ""
read -r -p "Wil je de systemd service installeren zodat het dashboard automatisch start? [j/N] " INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" =~ ^[jJ]$ ]]; then
    SERVICE_FILE="/etc/systemd/system/weather-dashboard.service"
    sed \
        -e "s|{{USER}}|$(whoami)|g" \
        -e "s|{{PROJECT}}|$PROJECT|g" \
        "$PROJECT/weather-dashboard.service.template" \
        | sudo tee "$SERVICE_FILE" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable weather-dashboard
    echo ">>> Service geinstalleerd en ingeschakeld."
    echo "    Start met: sudo systemctl start weather-dashboard"
else
    echo ">>> Service overgeslagen. Start handmatig met: ./start.sh"
fi

echo ""
echo "=== Setup klaar! ==="
echo "Controleer je API-sleutels in: $BACKEND/.env"
echo "Start de app met: $PROJECT/start.sh"
