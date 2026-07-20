# Toe te voegen Spots

Vul hieronder spots in die je wilt toevoegen.
Zeg daarna **"updateSpots"** — Claude voegt de spots toe aan
`backend/spots.json` (één bron van truth), herbouwt de frontend en herlaadt Gunicorn.

`backend/app.py` laadt `spots.json` bij startup in `SPOTS_META`. Een nieuwe spot
is dus pas zichtbaar na een herstart van de backend.

## Formaat

| veld          | verplicht | uitleg |
|---------------|-----------|--------|
| id            | ja        | lowercase, koppeltekens ipv spaties, uniek |
| name          | ja        | weergavenaam in de app; buitenlandse spots met landcode, bijv. `Sylt (DE)` |
| lat           | ja        | decimale graden (bijv. 52.374) |
| lon           | ja        | decimale graden, negatief = west |
| min_wind      | nee       | ondergrens werkbare wind in knopen |
| max_wind      | nee       | bovengrens werkbare wind in knopen |
| shore_angle   | nee       | kustrichting in graden; bepaalt on-/offshore-inschatting |
| webcam        | nee       | URL van een webcampagina |
| webcam_stream | nee       | directe stream-URL, als die er is |
| knmi_stn      | nee       | alleen bij een KNMI-station vlakbij — NL-only, rest loopt via Open-Meteo |
| subtitle      | nee       | korte toevoeging onder de naam |

---

## Wachtrij

<!-- Voeg hieronder toe. Verwijder een rij zodra de spot is toegevoegd. -->

| id | name | lat | lon | min_wind | max_wind | shore_angle |
|----|------|-----|-----|----------|----------|-------------|
|    |      |     |     |          |          |             |

---

## Voorbeelden ter inspiratie (nog niet in de app)

<!-- Bijgewerkt na updateSpots 2026-04-02: alle voorbeelden zijn toegevoegd -->

| id | name | lat | lon |
|----|------|-----|-----|
|    | (leeg — suggesties welkom) | | |
