import { useMemo, useState, useEffect } from "react";

const MS_TO_KTS = 1.94384;

function getShoreType(windDir, shoreAngle) {
  if (windDir == null || shoreAngle == null) return null;
  const diff = Math.abs(((windDir - shoreAngle + 180) % 360 + 360) % 360 - 180);
  if (diff <= 30)  return "ON SHORE";
  if (diff <= 60)  return "SIDE-ON";
  if (diff <= 120) return "SIDE SHORE";
  if (diff <= 150) return "SIDE-OFF";
  return "OFF SHORE";
}

function shoreOk(windDir, shoreAngle, allowedTypes) {
  if (!allowedTypes?.length) return true;
  if (shoreAngle == null) return true; // geen oriëntatie known → niet blokkeren
  const shore = getShoreType(windDir, shoreAngle);
  return shore != null && allowedTypes.includes(shore);
}

export function useAlarmMatch(spot, rules, activeSport) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!spot || !activeSport || activeSport === "off") return { matches: [], hasMatch: false };
    const rule = rules?.[activeSport];
    if (!rule) return { matches: [], hasMatch: false };

    const shoreAngle = spot.shore_angle ?? null;
    const nowMs = Date.now() + (spot.utcOffset ?? 0) * 1000;

    // Marine data als lookup op "YYYY-MM-DDTHH:MM" (3-uurlijks)
    const marineByKey = {};
    if (activeSport === "golfsurfen") {
      for (const m of spot.marine ?? []) {
        marineByKey[`${m.date}T${m.t}`] = m;
      }
    }

    const windPoints = [...(spot.windLive ?? []), ...(spot.windForecast ?? [])];
    const matches = [];

    for (const pt of windPoints) {
      if (!pt.date || !pt.t) continue;
      const ptMs = new Date(`${pt.date}T${pt.t}:00Z`).getTime();
      if (ptMs < nowMs) continue;

      const kts = (pt.v ?? 0) * MS_TO_KTS;

      if (activeSport === "kiten" || activeSport === "windsurfen") {
        if (kts < rule.windMin || kts > rule.windMax) continue;
        if (!shoreOk(pt.dir, shoreAngle, rule.shoreTypes)) continue;

      } else if (activeSport === "golfsurfen") {
        if (kts > rule.windMax) continue;
        if (!shoreOk(pt.dir, shoreAngle, rule.shoreTypes)) continue;

        // Zoek dichtstbijzijnde marine punt (meest recente 3-uursblok op basis van lokale spottime)
        const blockHour = Math.floor(parseInt(pt.t.slice(0, 2)) / 3) * 3;
        const marineKey = `${pt.date}T${String(blockHour).padStart(2, "0")}:00`;
        const marine = marineByKey[marineKey];
        if (marine) {
          if ((marine.hs ?? 0) < rule.waveMin) continue;
          const period = marine.swp ?? marine.tp ?? 0;
          if (period < rule.periodMin) continue;
        }
        // Geen marine data → condities onbekend, toch tonen (wind is al OK)
      }

      matches.push(pt);
    }

    return { matches, hasMatch: matches.length > 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, rules, activeSport, tick]);
}
