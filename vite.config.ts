import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "frontend",
  publicDir: "public",
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,svg,webmanifest}"],
      },
      manifest: {
        id: "/",
        name: "Rangkumin",
        short_name: "Rangkumin",
        description: "Ruang keuangan sederhana untuk tumbuh bersama.",
        lang: "id",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8f0e9",
        theme_color: "#f8f0e9",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
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
