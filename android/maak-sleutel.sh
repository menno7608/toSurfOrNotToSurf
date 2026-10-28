#!/usr/bin/env bash
# Maakt een nieuwe, geheime ondertekeningssleutel voor de Android-widget en zet hem als
# GitHub-geheim. Draai dit zelf (het schrijft naar de geheimen van de repo):
#
#   bash android/maak-sleutel.sh
#
# Daarna: git rm android/widget.keystore, committen en pushen. Eenmalig moet iedereen de
# widget-app verwijderen en opnieuw installeren (nieuwe sleutel = andere app voor Android).
set -euo pipefail
MAP="$HOME/.config/tosurf-widget"
mkdir -p "$MAP"; chmod 700 "$MAP"
WW="$(openssl rand -hex 20)"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$MAP/k.pem" -out "$MAP/c.pem" -days 36500 \
  -subj "/CN=toSurfOrNotToSurf widget" 2>/dev/null
openssl pkcs12 -export -inkey "$MAP/k.pem" -in "$MAP/c.pem" -name widget -out "$MAP/widget.p12" -passout "pass:$WW"
rm -f "$MAP/k.pem" "$MAP/c.pem"
printf '%s' "$WW" > "$MAP/wachtwoord.txt"; chmod 600 "$MAP/widget.p12" "$MAP/wachtwoord.txt"
base64 -w0 "$MAP/widget.p12" | gh secret set WIDGET_KEYSTORE_B64
gh secret set WIDGET_KEYSTORE_PASSWORD < "$MAP/wachtwoord.txt"
echo "Klaar. Een reservekopie van de sleutel staat in $MAP (buiten git). Bewaar die goed:"
echo "zonder deze sleutel kunnen bestaande installaties niet meer worden bijgewerkt."
