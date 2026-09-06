import { useEffect, useRef } from "react";

export function useAutoRefresh(
  refresh: () => void,
  intervalMs = 10_000,
  enabled = true,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (enabled && document.visibilityState === "visible")
        refreshRef.current();
    }, intervalMs);
    const onVisible = () => {
      if (enabled && document.visibilityState === "visible")
        refreshRef.current();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);
}
