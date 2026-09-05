import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            if (!proxyReq.getHeader("Cf-Access-Authenticated-User-Email")) {
              proxyReq.setHeader(
                "Cf-Access-Authenticated-User-Email",
                "user1@example.invalid",
              );
            }
          });
        },
      },
    },
  },
});
