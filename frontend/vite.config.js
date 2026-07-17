import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../backend/static/app",
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:5000" }
  }
});
