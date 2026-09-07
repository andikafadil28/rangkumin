import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { DEMO_MODE } from "./demoMode";

if (!DEMO_MODE) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          void registration.update().catch(() => undefined);
        }
      };

      document.addEventListener("visibilitychange", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
