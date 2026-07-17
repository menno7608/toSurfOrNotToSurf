export default function CurrentMapOverlay({ spot }) {
  const lat  = spot?.location?.lat ?? 52.1;
  const lon  = spot?.location?.lon ?? 4.3;
  const zoom = 8;

  const src =
    `https://embed.windy.com/embed2.html` +
    `?lat=${lat}&lon=${lon}` +
    `&detailLat=${lat}&detailLon=${lon}` +
    `&zoom=${zoom}` +
    `&level=surface&overlay=currents&product=ecmwf` +
    `&menu=&message=true&marker=true` +
    `&metricWind=kt&metricTemp=%C2%B0C` +
    `&type=map&location=coordinates`;

  return (
    <iframe
      src={src}
      style={{ width: "100%", height: "100%", border: "none" }}
      allow="fullscreen"
      title="Windy – Currents"
    />
  );
}
