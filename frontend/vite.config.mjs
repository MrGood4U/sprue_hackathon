import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { parseApiBaseUrl } from "./src/services/api/public-config.js";

export default defineConfig(({ mode }) => {
  // Validate public configuration without loading or exposing server secrets.
  parseApiBaseUrl(loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL);
  return {
    build: {
      outDir: "dist/client",
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react()],
  };
});
