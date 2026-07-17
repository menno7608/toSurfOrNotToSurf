import { useTheme } from "../theme.js";

const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

function toCompassShort(deg) {
  if (deg == null) return "–";
  return COMPASS[Math.round(deg / 22.5) % 16];
}

function getShoreType(windDir, shoreAngle) {
  const diff = Math.abs(((windDir - shoreAngle + 180) % 360 + 360) % 360 - 180);
  if (diff <= 30)  return { label: "ON SHORE",   color: "#e74c3c" };
  if (diff <= 60)  return { label: "SIDE-ON",    color: "#e67e22" };
  if (diff <= 120) return { label: "SIDE SHORE", color: "#27ae60" };
  if (diff <= 150) return { label: "SIDE-OFF",   color: "#e67e22" };
  return               { label: "OFF SHORE",  color: "#e74c3c" };
}

export default function WindDirectionBadge({ windDir, shoreAngle }) {
  const theme = useTheme();
  if (windDir == null) return null;

  const compass = toCompassShort(windDir);
  const shore   = shoreAngle != null ? getShoreType(windDir, shoreAngle) : null;

  return (
    <div style={{
      display:        "flex",
      justifyContent: "center",
      alignItems:     "center",
      gap:            10,
      padding:        "2px 0 5px 0",
      flexShrink:     0,
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: theme.dark }}>
        {compass}
      </span>
      {shore && (
        <span style={{
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: "0.12em",
          color:         shore.color,
          border:        `1px solid ${shore.color}`,
          borderRadius:  4,
          padding:       "1px 6px",
        }}>
          {shore.label}
        </span>
      )}
    </div>
  );
}
