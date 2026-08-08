import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/mobile/",
  publicDir: "mobile-public",
  plugins: [react()],
  build: {
    outDir: "../backend/static/app-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: "mobile.html",
    },
  },
});
