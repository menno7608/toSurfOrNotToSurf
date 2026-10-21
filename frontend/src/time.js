/* Tijd in deze app is spotlokale tijd: de API geeft t/date al in de tijdzone
   van de spot terug. De browserdatum gebruiken klopt dan alleen toevallig — bij
   een spot in een andere zone niet. Daarom overal via deze twee helpers. */

/** Vandaag in spotlokale tijd, als YYYY-MM-DD. */
export function spotToday(utcOffset = 0) {
  return new Date(Date.now() + (utcOffset ?? 0) * 1000).toISOString().slice(0, 10);
}

/** Datum van gisteren in spotlokale tijd, als YYYY-MM-DD. */
export function spotYesterday(utcOffset = 0) {
  const ms = Date.now() + (utcOffset ?? 0) * 1000 - 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/* Hier stond overal `liveAt.slice(11, 16)`, dus alleen het tijdstip. Kwam er een
   payload van dagen terug uit de cache, dan las "updated at: 10:20" als een
   verse meting van vanochtend. Datum erbij zodra het niet vandaag is. */
export function fmtUpdatedAt(liveAt, utcOffset = 0) {
  if (!liveAt) return null;
  const time = liveAt.slice(11, 16);
  const date = liveAt.slice(0, 10);
  if (date === spotToday(utcOffset)) return time;
  const d = new Date(date + "T12:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${time}`;
}
