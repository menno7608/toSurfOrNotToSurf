import React from "react";

// HLS-stream (.m3u8) in een <video>. Safari/iOS speelt HLS zelf af; elders laden
// we hls.js pas op het moment dat er echt een HLS-cam getoond wordt, zodat de
// hoofdbundel niet groeit voor spots zonder zo'n stream.
export default function HlsVideo({ url, title, fallbackUrl, accent }) {
  const video = React.useRef(null);
  const [fout, setFout] = React.useState(false);

  React.useEffect(() => {
    const el = video.current;
    if (!el) return undefined;
    setFout(false);
    let hls = null;
    let gestopt = false;

    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.addEventListener("error", () => setFout(true), { once: true });
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (gestopt) return;
        if (!Hls.isSupported()) { setFout(true); return; }
        hls = new Hls({ liveSyncDurationCount: 3 });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          // Eén herstelpoging bij netwerk- of mediafouten; lukt dat niet, dan melden.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setFout(true);
        });
        hls.on(Hls.Events.MANIFEST_LOAD_ERROR, () => setFout(true));
        hls.loadSource(url);
        hls.attachMedia(el);
      }).catch(() => setFout(true));
    }

    return () => {
      gestopt = true;
      if (hls) hls.destroy();
      el.removeAttribute("src");
      el.load();
    };
  }, [url]);

  if (fout) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12, background: "#000", color: "#fff",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em" }}>STREAM OFFLINE</span>
        {fallbackUrl && (
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: accent, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
            Open webcam in browser →
          </a>
        )}
      </div>
    );
  }

  return (
    <video
      ref={video}
      title={title}
      autoPlay
      muted
      playsInline
      controls
      style={{ flex: 1, width: "100%", minHeight: 0, background: "#000", objectFit: "contain", display: "block" }}
    />
  );
}
