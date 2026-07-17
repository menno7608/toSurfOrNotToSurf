#!/bin/bash
URL_FILE="$(cd "$(dirname "$0")" && pwd)/URL.txt"

if [ ! -f "$URL_FILE" ]; then
  echo "URL.txt niet gevonden: $URL_FILE"
  exit 1
fi

URL=$(cat "$URL_FILE" | tr -d '[:space:]')

if [ -z "$URL" ]; then
  echo "URL.txt is leeg"
  exit 1
fi

xdg-open "$URL"
