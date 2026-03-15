import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "http://localhost:3000",
        ws: true,
      },
      "/info": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/system": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/oauth": "http://localhost:3000",
      "/xrpc": "http://localhost:3000",
    },
  },
});
