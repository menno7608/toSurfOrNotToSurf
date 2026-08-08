import { useEffect, useState } from "react";

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.("(display-mode: standalone)").matches
  );

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !prompt) return null;

  const install = async () => {
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") setPrompt(null);
  };

  return (
    <button
      type="button"
      onClick={install}
      style={{
        position: "fixed", right: 12, bottom: 12, zIndex: 10000,
        border: "2px solid #f0ebe0", borderRadius: 8,
        padding: "10px 14px", background: "#1a2635", color: "#f0ebe0",
        boxShadow: "0 3px 12px rgba(0,0,0,.35)", fontSize: 14,
        fontWeight: 800, cursor: "pointer",
      }}
    >
      App installeren
    </button>
  );
}
