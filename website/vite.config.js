import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pricing: resolve(__dirname, "pricing.html"),
        comingSoon: resolve(__dirname, "coming-soon.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
});
