import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/web": {
        target: "http://186.246.18.100:8002",
        changeOrigin: true,
      },
    },
  },
});
