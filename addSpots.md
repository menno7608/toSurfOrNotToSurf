# Toe te voegen Spots

Vul hieronder spots in die je wilt toevoegen.
Zeg daarna **"updateSpots"** — Claude leest dit bestand, voegt de spots toe aan
`backend/app.py` → `SPOTS_META`, herbouwt de frontend, herlaadt Gunicorn,
en werkt `spotsInApp.md` bij.

## Formaat

| veld      | verplicht | uitleg |
|-----------|-----------|--------|
| id        | ja        | lowercase, koppeltekens ipv spaties, uniek |
| name      | ja        | weergavenaam in de app |
| lat       | ja        | decimale graden (bijv. 52.374) |
| lon       | ja        | decimale graden, negatief = west |
| knmi_stn  | nee       | alleen als er een KNMI-station vlakbij is |

---

## Wachtrij

<!-- Voeg hieronder toe. Verwijder een rij zodra de spot is toegevoegd. -->

| id | name | lat | lon | knmi_stn |
|----|------|-----|-----|----------|
|    |      |     |     |          |

---

## Voorbeelden ter inspiratie (nog niet in de app)

<!-- Bijgewerkt na updateSpots 2026-04-02: alle voorbeelden zijn toegevoegd -->

| id | name | lat | lon |
|----|------|-----|-----|
|    | (leeg — suggesties welkom) | | |
