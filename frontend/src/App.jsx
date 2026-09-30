import React, { useEffect, useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import SpotSidebar from "./components/SpotSidebar.jsx";
import WindChart from "./components/WindChart.jsx";
import WeekForecast from "./components/WeekForecast.jsx";
import MobileLayout from "./components/MobileLayout.jsx";
import WebcamOverlay from "./components/WebcamOverlay.jsx";
import CurrentMapOverlay from "./components/CurrentMapOverlay.jsx";
import CurrentChart from "./components/CurrentChart.jsx";
import WaveChart from "./components/WaveChart.jsx";
import TideChart from "./components/TideChart.jsx";
import RainChart from "./components/RainChart.jsx";
import ChartTabs from "./components/ChartTabs.jsx";
import AlarmPanel from "./components/AlarmPanel.jsx";
import { ThemeCtx, LIGHT, DARK } from "./theme.js";
import { useAlarmRules } from "./hooks/useAlarmRules.js";
import { useAlarmMatch } from "./hooks/useAlarmMatch.js";
import { useSunTheme, getSunriseSunset } from "./hooks/useSunTheme.js";


function useIsMobile(forceMobile = false) {
  const [mobile, setMobile] = useState(() => forceMobile || window.innerWidth < 900);
  useEffect(() => {
    if (forceMobile) {
      setMobile(true);
      return undefined;
    }
    const mq = window.matchMedia("(max-width: 899px)");
    const handler = (e) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [forceMobile]);
  return mobile;
}

export default function App({ forceMobile = false }) {
  const [spots, setSpots] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem("selectedId") || ""; }
    catch { return ""; }
  });
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("kts");
  const [waveUnit, setWaveUnit] = useState(() => {
    try { return localStorage.getItem("waveUnit") || "m"; }
    catch { return "m"; }
  });
  const toggleWaveUnit = () => setWaveUnit((u) => {
    const next = u === "m" ? "ft" : "m";
    try { localStorage.setItem("waveUnit", next); } catch {}
    return next;
  });
  const [weatherModel, setWeatherModel] = useState("best_match");
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile(forceMobile);

  const [isDark, setIsDark] = useState(() => {
    // Initialise immediately from sun position so there's no theme flash on load
    try {
      const { sunrise, sunset } = getSunriseSunset(52.3, 4.9);
      if (sunrise && sunset) {
        const now = new Date();
        return !(now >= sunrise && now < sunset);
      }
    } catch {}
    return false;
  });

  const toggleTheme = () => setIsDark((v) => !v);

  useEffect(() => {
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("favorites") || "[]"); }
    catch { return []; }
  });

  const selectSpot = (id) => {
    setSelectedId(id);
    try { localStorage.setItem("selectedId", id); } catch {}
  };

  const [webcamOpen, setWebcamOpen] = useState(false);
  const [rwsMapOpen, setRwsMapOpen] = useState(false);
  const [activeChart, setActiveChart] = useState("wind");
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [scrollTargetDate, setScrollTargetDate] = useState(null);
  const { rules, updateRule, spotSport, setSpotSport } = useAlarmRules();

  const [autoRotate, setAutoRotate] = useState(() => {
    try { return JSON.parse(localStorage.getItem("autoRotate") || "false"); }
    catch { return false; }
  });

  const toggleAutoRotate = () => {
    setAutoRotate((v) => {
      const next = !v;
      localStorage.setItem("autoRotate", JSON.stringify(next));
      return next;
    });
  };

  const [spotModels, setSpotModels] = useState(() => {
    try { return JSON.parse(localStorage.getItem("spotModels") || "{}"); }
    catch { return {}; }
  });

  const saveSpotModel = (spotId, modelId) => {
    setSpotModels((prev) => {
      const next = { ...prev };
      if (next[spotId] === modelId) { delete next[spotId]; } else { next[spotId] = modelId; }
      localStorage.setItem("spotModels", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => { setWebcamOpen(false); setRwsMapOpen(false); setActiveChart("wind"); }, [selectedId]);
  useEffect(() => { setScrollTargetDate(null); }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const saved = JSON.parse(localStorage.getItem("spotModels") || "{}")[selectedId];
    if (saved) setWeatherModel(saved);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem("favorites", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!autoRotate || favorites.length < 2) return;
    const id = setInterval(() => {
      setSelectedId((current) => {
        const favIds = favorites.filter((f) => spots.some((s) => s.id === f));
        if (favIds.length < 2) return current;
        const idx = favIds.indexOf(current);
        const next = favIds[(idx + 1) % favIds.length];
        try { localStorage.setItem("selectedId", next); } catch {}
        return next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRotate, favorites, spots]);

  const sortedSpots = useMemo(() => {
    const favs = spots.filter((s) => favorites.includes(s.id));
    const rest = spots.filter((s) => !favorites.includes(s.id));
    return [...favs, ...rest];
  }, [spots, favorites]);

  useEffect(() => {
    let lastLoadedAt = 0;
    let timer;
    let retryTimer;
    let isCurrent = true;
    const spreiding = Math.floor(Math.random() * 180_000);

    const load = () => {
      lastLoadedAt = Date.now();
      setLoading(true);
      fetch(`/api/spots?model=${weatherModel}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (!isCurrent) return;
          if (!Array.isArray(data)) throw new Error("API returned no array");
          if (data.length === 0) {
            clearTimeout(retryTimer);
            retryTimer = setTimeout(load, 2_000);
            return;
          }
          setSpots(data);
          setSelectedId((prev) => {
            if (prev && data.some((s) => s.id === prev)) return prev;
            const storedFavs = JSON.parse(localStorage.getItem("favorites") || "[]");
            const firstFav = storedFavs.find((id) => data.some((s) => s.id === id));
            const next = firstFav || data.find((s) => s.id === "scheveningen")?.id || data[0]?.id || "";
            try { localStorage.setItem("selectedId", next); } catch {}
            return next;
          });
        })
        .catch((e) => { if (isCurrent) setError(String(e)); })
        .finally(() => { if (isCurrent) setLoading(false); });
    };

    const scheduleNext = () => {
      clearTimeout(timer);
      const now = new Date();
      const msIntoInterval = ((now.getMinutes() % 10) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
      // + spreiding per tabblad: zonder die spreiding vroeg élk open tabblad om
      // hh:m0:30 tegelijk 1,5 MB op, en de uplink van de Pi haalt er ± 0,7 per
      // seconde (audit 29-09). Nog steeds ná de 10-minutenronde van de bronnen.
      const msUntilNext = 10 * 60 * 1000 - msIntoInterval + 30 * 1000 + spreiding;
      timer = setTimeout(() => { load(); scheduleNext(); }, msUntilNext);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const staleSince = Date.now() - lastLoadedAt;
        if (staleSince > 60_000) {
          load();
          scheduleNext();
        }
      }
    };

    load();
    scheduleNext();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [weatherModel]);

  const spot = useMemo(
    () => sortedSpots.find((s) => s.id === selectedId) ?? sortedSpots[0],
    [sortedSpots, selectedId]
  );

  const activeSport = spotSport[spot?.id] ?? "off";
  const { hasMatch } = useAlarmMatch(spot, rules, activeSport);

  // Auto-switch theme at sunrise/sunset for the selected spot's location
  useSunTheme(spot?.location?.lat, spot?.location?.lon, setIsDark);

  const theme = isDark ? DARK : LIGHT;

  // Sunrise/sunset for today at current spot (used for button tooltip)
  const { sunrise: todaySunrise, sunset: todaySunset } = useMemo(() => {
    const lat = spot?.location?.lat ?? 52.3;
    const lon = spot?.location?.lon ?? 4.9;
    return getSunriseSunset(lat, lon);
  }, [spot?.location?.lat, spot?.location?.lon]);

  if (error) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#c0392b", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (isMobile) {
    return (
      <ThemeCtx.Provider value={theme}>
        <MobileLayout
          spots={sortedSpots}
          spot={spot}
          selectedId={selectedId}
          onSelectId={selectSpot}
          unit={unit}
          onUnitChange={setUnit}
          weatherModel={weatherModel}
          onModelChange={setWeatherModel}
          loading={loading}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          spotModels={spotModels}
          onSaveSpotModel={saveSpotModel}
          isDark={isDark}
          onThemeToggle={toggleTheme}
          waveUnit={waveUnit}
          onWaveUnitToggle={toggleWaveUnit}
          alarmMatch={hasMatch}
          onAlarmToggle={() => setAlarmOpen((v) => !v)}
        />
        {alarmOpen && (
          <AlarmPanel
            spot={spot}
            rules={rules}
            updateRule={updateRule}
            spotSport={spotSport}
            setSpotSport={setSpotSport}
            onClose={() => setAlarmOpen(false)}
          />
        )}
      </ThemeCtx.Provider>
    );
  }

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: theme.cream }}>
        <Header
          spot={spot}
          spots={sortedSpots}
          selectedId={selectedId}
          onSelectId={selectSpot}
          unit={unit}
          onUnitChange={setUnit}
          loading={loading}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          webcamOpen={webcamOpen}
          onWebcamToggle={() => setWebcamOpen((v) => !v)}
          rwsMapOpen={rwsMapOpen}
          onRwsMapToggle={() => setRwsMapOpen((v) => !v)}
          autoRotate={autoRotate}
          onAutoRotateToggle={toggleAutoRotate}
          canAutoRotate={favorites.length >= 2}
          isDark={isDark}
          onThemeToggle={toggleTheme}
          sunrise={todaySunrise}
          sunset={todaySunset}
          alarmMatch={hasMatch}
          onAlarmToggle={() => setAlarmOpen((v) => !v)}
        />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <SpotSidebar spot={spot} unit={unit} waveUnit={waveUnit} onWaveUnitToggle={toggleWaveUnit} weatherModel={weatherModel} onModelChange={setWeatherModel} spotModels={spotModels} onSaveSpotModel={saveSpotModel} />
          <div style={{ flex: 1, position: "relative", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <ChartTabs spot={spot} active={activeChart} onChange={setActiveChart} />
            {activeChart === "wind" && (
              <WindChart
                past={spot?.windPast}
                live={spot?.windLive}
                forecast={spot?.windForecast}
                unit={unit}
                windDir={spot?.live?.windDir}
                liveAt={spot?.liveAt}
                shoreAngle={spot?.shore_angle}
                utcOffset={spot?.utcOffset}
                scrollToDate={scrollTargetDate}
              />
            )}
            {activeChart === "current" && <CurrentChart spot={spot} />}
            {activeChart === "waves"   && <WaveChart spot={spot} waveUnit={waveUnit} />}
            {activeChart === "tide"    && <TideChart spot={spot} />}
            {activeChart === "rain"    && <RainChart spot={spot} />}
            <WeekForecast windDaily={spot?.windDaily} unit={unit} onDayClick={setScrollTargetDate} />
            {webcamOpen && (
              <div style={{
                position: "absolute", inset: 0,
                background: "#000",
                zIndex: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <WebcamOverlay spot={spot} />
              </div>
            )}
            {rwsMapOpen && (
              <div style={{
                position: "absolute", inset: 0,
                background: "#000",
                zIndex: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CurrentMapOverlay spot={spot} />
              </div>
            )}
          </div>
        </div>
      </div>
      {alarmOpen && (
        <AlarmPanel
          spot={spot}
          rules={rules}
          updateRule={updateRule}
          spotSport={spotSport}
          setSpotSport={setSpotSport}
          onClose={() => setAlarmOpen(false)}
        />
      )}
    </ThemeCtx.Provider>
  );
}
