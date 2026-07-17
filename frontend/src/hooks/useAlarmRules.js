import { useState } from "react";

export const ALL_SHORE_TYPES = ["OFF SHORE", "SIDE-OFF", "SIDE SHORE", "SIDE-ON", "ON SHORE"];

export const DEFAULT_RULES = {
  kiten: {
    windMin: 14,   // kts
    windMax: 28,
    shoreTypes: ["SIDE SHORE", "SIDE-ON", "SIDE-OFF"],
  },
  windsurfen: {
    windMin: 10,
    windMax: 35,
    shoreTypes: ["SIDE SHORE", "SIDE-ON", "SIDE-OFF", "ON SHORE"],
  },
  golfsurfen: {
    waveMin: 0.5,  // meter
    periodMin: 7,  // seconden
    windMax: 15,   // kts
    shoreTypes: ["OFF SHORE", "SIDE-OFF", "SIDE SHORE"],
  },
};

export function useAlarmRules() {
  const [rules, setRules] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("alarmRules") || "null");
      if (!saved) return DEFAULT_RULES;
      return {
        kiten:      { ...DEFAULT_RULES.kiten,      ...saved.kiten },
        windsurfen: { ...DEFAULT_RULES.windsurfen, ...saved.windsurfen },
        golfsurfen: { ...DEFAULT_RULES.golfsurfen, ...saved.golfsurfen },
      };
    } catch { return DEFAULT_RULES; }
  });

  // Per spot: welke sport is actief ("kiten"|"windsurfen"|"golfsurfen"|"off")
  const [spotSport, setSpotSportState] = useState(() => {
    try { return JSON.parse(localStorage.getItem("alarmSpotSport") || "{}"); }
    catch { return {}; }
  });

  const updateRule = (sport, key, value) => {
    setRules((prev) => {
      const next = { ...prev, [sport]: { ...prev[sport], [key]: value } };
      try { localStorage.setItem("alarmRules", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const setSpotSport = (spotId, sport) => {
    setSpotSportState((prev) => {
      const next = { ...prev, [spotId]: sport };
      try { localStorage.setItem("alarmSpotSport", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return { rules, updateRule, spotSport, setSpotSport };
}
