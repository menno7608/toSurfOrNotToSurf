// Webcam(s) per spot-ID
// Formaat: array van { label, url }
// label: korte naam voor de switcher (bijv. "Noord", "Haven")
// url: YouTube embed (autoplay+mute), CamStreamer embed, of andere iframe-URL
//
// YouTube:      https://www.youtube.com/embed/VIDEO_ID?autoplay=1&mute=1
// CamStreamer:  https://camstreamer.com/embed/STREAM_ID
// Netcamviewer: https://live.netcamviewer.nl/Webcam-NAAM/ID
// HLS:          elke URL die op .m3u8 eindigt → <video> met hls.js (zie HlsVideo.jsx)

const WEBCAMS = {

  // ── HOLLANDSE KUST (Noord→Zuid) ──────────────────────────────────────────

  "texel-de-koog": [
    { label: "Kaap Noord", url: "https://www.youtube.com/embed/Gq8dWezdEX8?autoplay=1&mute=1" },
    { label: "Paal 9",     url: "https://www.youtube.com/embed/qjA5XMhjFY4?autoplay=1&mute=1" },
    { label: "Paal 17",    url: "https://www.youtube.com/embed/Hq2Qbcuph4w?autoplay=1&mute=1" },
    { label: "Paal 20",    url: "https://www.youtube.com/embed/f_CtUNq1FR0?autoplay=1&mute=1" },
  ],

  "ameland": [
    { label: "Strand",    url: "https://www.youtube.com/embed/9QVlOqeT9_I?autoplay=1&mute=1" },
  ],

  "bergen-zee": [
    { label: "Bergen",    url: "https://camstreamer.com/embed/105306670" },
  ],

  "kijkduin": [
    { label: "Boulevard", url: "https://camstreamer.com/embed/234912844" },
  ],

  "katwijk": [
    { label: "Strand N",  url: "https://camstreamer.com/embed/5873"  },
    { label: "Strand Z",  url: "https://camstreamer.com/embed/43680" },
  ],

  "noordwijk": [
    { label: "Boulevard", url: "https://camstreamer.com/embed/7959" },
  ],

  "zandvoort": [
    { label: "Boulevard", url: "https://camstreamer.com/embed/32836" },
  ],

  "scheveningen": [
    { label: "Aloha",     url: "https://www.youtube.com/embed/XB2T9RjIM-g?autoplay=1&mute=1" },
  ],

  "brouwersdam": [
    { label: "Strand",    url: "https://www.youtube.com/embed/KjK02QIm4ZI?autoplay=1&mute=1" },
  ],

  "egmond-zee": [
    { label: "Pompplein", url: "https://www.youtube.com/embed/TTWBm-m8Qhc?autoplay=1&mute=1" },
    { label: "Boulevard", url: "https://www.youtube.com/embed/mI1Os7TFdGc?autoplay=1&mute=1" },
  ],

  "hoek-holland": [
    { label: "Hoek",      url: "https://www.youtube.com/embed/9NRBCI8bkfo?autoplay=1&mute=1" },
  ],

  "renesse": [
    { label: "Haven",     url: "https://www.youtube.com/embed/whlnez2Mmpg?autoplay=1&mute=1" },
  ],

  "westkapelle": [
    { label: "Strand",    url: "https://www.youtube.com/embed/vxk4u1Tpfhk?autoplay=1&mute=1" },
  ],

  "vlissingen": [
    { label: "Strand",    url: "https://www.youtube.com/embed/6iiB0xpyZUQ?autoplay=1&mute=1" },
  ],

  "domburg": [
    { label: "Duinen",    url: "https://live.netcamviewer.nl/Webcam-Domburg/530" },
  ],

  "lauwersoog": [
    { label: "Terminal",  url: "https://www.youtube.com/embed/E4pdAYOGBXA?autoplay=1&mute=1" },
  ],

  "vlieland": [
    { label: "Badhuys",   url: "https://www.youtube.com/embed/34tOlrk7z4M?autoplay=1&mute=1" },
  ],

  // ── BUITENLAND ───────────────────────────────────────────────────────────

  "norddeich": [
    { label: "Haven",     url: "https://www.youtube.com/embed/Ej-5nfp2MRs?autoplay=1&mute=1" },
    { label: "Frisia III", url: "https://www.youtube.com/embed/mn5GITwfwfE?autoplay=1&mute=1" },
  ],

  "essaouira": [
    { label: "Targhate",  url: "https://s1.vision-environnement.com/live/player/webcams-paris/essaouira0.php" },
  ],

  "bonaire-atlantis": [
    { label: "Atlantis",  url: "https://www.youtube.com/embed/EcumU_n6fTY?autoplay=1&mute=1" },
  ],

  // ── HLS-STREAMS (.m3u8, via <video> + hls.js; gecontroleerd 29-09-2026) ──

  "wijk-aan-zee": [
    { label: "De Hangout", url: "https://webcam.dehangout.nl/stream.m3u8" },
  ],

  "enkhuizen": [
    { label: "Enkhuizen", url: "https://6162417352ffd.streamlock.net/live/enkhuizen.stream/playlist.m3u8" },
  ],

  // ── GEEN EMBEDBARE STREAM GEVONDEN ──────────────────────────────────────
  // workum         → HLS-stream (streamlock.net/live/workumptz) geeft 404 sinds ≤ 29-09-2026
  // terschelling   → Lookr timelapse, geen YouTube
  // callantsoog    → eigen platform (strandpaviljoendetoko.nl), geen YouTube
  // makkum         → Windfinder-embed, niet iframe-baar
  // tarifa         → kitescholen eigen streams, geen YouTube
  // dakhla         → Viewsurf/eigen platform, geen YouTube
};

export default WEBCAMS;
