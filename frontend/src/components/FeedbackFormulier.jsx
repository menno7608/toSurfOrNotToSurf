import { useState } from "react";
import { t as vertaal } from "../taal.js";

const DARK = "#1a2635";
const CREAM = "#f0ebe0";
const MAX_LEN = 1000;

export default function FeedbackFormulier() {
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState("idle"); // idle | versturen | verstuurd | fout

  const versturen = async () => {
    const schoon = tekst.trim();
    if (!schoon) return;
    setStatus("versturen");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tekst: schoon, pagina: window.location.pathname }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTekst("");
      setStatus("verstuurd");
    } catch {
      setStatus("fout");
    }
  };

  const leeg = !tekst.trim() || status === "versturen";

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{vertaal("Idea or bug?")}</div>
      <textarea
        value={tekst}
        onChange={(e) => { setTekst(e.target.value.slice(0, MAX_LEN)); if (status !== "idle") setStatus("idle"); }}
        placeholder={vertaal("What would you like to see, or what isn't working well?")}
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          border: `2px solid ${CREAM}`, borderRadius: 8,
          padding: "10px 12px", background: "transparent", color: CREAM,
          fontSize: 14, lineHeight: 1.5, fontFamily: "inherit",
        }}
      />
      {status === "fout" && (
        <div style={{ fontSize: 13, marginTop: 6, color: "#e8a0a0" }}>{vertaal("That didn't work. Please try again.")}</div>
      )}
      {status === "verstuurd" && (
        <div style={{ fontSize: 13, marginTop: 6 }}>{vertaal("Sent — it goes straight to the maker. Thanks!")}</div>
      )}
      <button
        type="button"
        onClick={versturen}
        disabled={leeg}
        style={{
          marginTop: 10, width: "100%", border: `2px solid ${CREAM}`, borderRadius: 8,
          padding: "10px 0", background: CREAM, color: DARK,
          fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: leeg ? 0.6 : 1,
        }}
      >
        {vertaal(status === "versturen" ? "Sending…" : "Send")}
      </button>
    </div>
  );
}
