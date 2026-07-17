import { useEffect, useRef } from "react";

const DEFAULT_LAT = 52.3;
const DEFAULT_LON = 4.9;

export function getSunriseSunset(lat, lon, date = new Date()) {
  const rad = Math.PI / 180;
  // Use local noon to anchor the Julian date to the right calendar day
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const JD = noon.getTime() / 86400000 + 2440587.5;
  const n = JD - 2451545.0;

  const L0 = (280.46646 + 0.9856474 * n) % 360;
  const M  = (357.52911 + 0.98560028 * n) % 360;
  const C  = 1.914602 * Math.sin(M * rad)
           - 0.004817 * Math.sin(2 * M * rad)
           + 0.000014 * Math.sin(3 * M * rad);
  const sunLon  = L0 + C;
  const omega   = 125.04 - 0.052954 * n;
  const lambda  = sunLon - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0    = 23.439291111 - 0.013004167 * (n / 36525);
  const epsilon = eps0 + 0.00256 * Math.cos(omega * rad);

  const sinDec = Math.sin(epsilon * rad) * Math.sin(lambda * rad);
  const dec    = Math.asin(sinDec) / rad;

  const y   = Math.tan((epsilon * rad) / 2) ** 2;
  const ecc = 0.016708634;
  const Lm  = L0 * rad;
  const Mm  = M  * rad;
  const EqT = (4 / rad) * (
      y * Math.sin(2 * Lm)
    - 2 * ecc * Math.sin(Mm)
    + 4 * ecc * y * Math.sin(Mm) * Math.cos(2 * Lm)
    - 0.5 * y * y * Math.sin(4 * Lm)
    - 1.25 * ecc * ecc * Math.sin(2 * Mm)
  );

  const cosHA = (
    Math.sin(-0.8333 * rad) - Math.sin(lat * rad) * Math.sin(dec * rad)
  ) / (Math.cos(lat * rad) * Math.cos(dec * rad));

  if (Math.abs(cosHA) > 1) return { sunrise: null, sunset: null };

  const HA        = Math.acos(cosHA) / rad;
  const solarNoon = 720 - 4 * lon - EqT;            // minutes UTC
  const srMin     = solarNoon - HA * 4;
  const ssMin     = solarNoon + HA * 4;

  const dayUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    sunrise: new Date(dayUTC + srMin * 60000),
    sunset:  new Date(dayUTC + ssMin * 60000),
  };
}

// Calls setIsDark immediately based on sun position and schedules future transitions.
// Returns nothing — just drives the theme automatically.
export function useSunTheme(lat, lon, setIsDark) {
  const timerRef = useRef(null);

  useEffect(() => {
    const useLat = lat ?? DEFAULT_LAT;
    const useLon = lon ?? DEFAULT_LON;

    function tick() {
      const now = new Date();
      const { sunrise, sunset } = getSunriseSunset(useLat, useLon, now);

      if (!sunrise || !sunset) return;

      const isDay = now >= sunrise && now < sunset;
      setIsDark(!isDay);

      if (timerRef.current) clearTimeout(timerRef.current);

      let next;
      if (now < sunrise) {
        next = sunrise;
      } else if (now < sunset) {
        next = sunset;
      } else {
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const { sunrise: tmSunrise } = getSunriseSunset(useLat, useLon, tomorrow);
        next = tmSunrise;
      }

      if (next) {
        // Add a 60s buffer so we land cleanly after the transition
        const delay = Math.max(next.getTime() - now.getTime(), 0) + 60000;
        timerRef.current = setTimeout(tick, delay);
      }
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lat, lon, setIsDark]);
}
