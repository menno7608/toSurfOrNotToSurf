import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import InstallAppButton from "./components/InstallAppButton.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root"))
  .render(
    <React.StrictMode>
      <App forceMobile />
      <InstallAppButton />
    </React.StrictMode>
  );

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/mobile/service-worker.js", { scope: "/mobile/" })
      .catch((error) => console.warn("toSurfOrNotToSurf kon offline support niet starten:", error));
  });
}
