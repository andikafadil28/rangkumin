import { useEffect, useRef, useState } from "react";
import { getOutboxItems } from "./db";
import {
  OUTBOX_CHANGED_EVENT,
  TRANSACTION_SYNCED_EVENT,
  retryFailedOutbox,
  syncTransactionOutbox,
} from "./sync";

export function useOfflineSync(onSynced: () => void) {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refreshCount = () => {
      void getOutboxItems()
        .then((items) => {
          if (!active) return;
          setPending(items.filter((item) => item.status === "pending").length);
          setFailed(items.filter((item) => item.status === "failed").length);
        })
        .catch(() => {
          if (active) setSyncError("Penyimpanan offline tidak tersedia.");
        });
    };
    const runSync = (includeFailed = false) => {
      void (includeFailed ? retryFailedOutbox() : syncTransactionOutbox())
        .then(() => {
          if (active) setSyncError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setSyncError(
            cause instanceof Error
              ? cause.message
              : "Sinkronisasi belum dapat dijalankan.",
          );
        })
        .finally(refreshCount);
    };
    const trySync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) runSync();
      refreshCount();
    };
    const visible = () => {
      if (document.visibilityState === "visible") trySync();
    };
    const synced = () => {
      refreshCount();
      onSyncedRef.current();
    };

    trySync();
    const retryTimer = window.setInterval(trySync, 30_000);
    window.addEventListener("online", trySync);
    window.addEventListener("offline", trySync);
    window.addEventListener("focus", trySync);
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshCount);
    window.addEventListener(TRANSACTION_SYNCED_EVENT, synced);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(retryTimer);
      window.removeEventListener("online", trySync);
      window.removeEventListener("offline", trySync);
      window.removeEventListener("focus", trySync);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshCount);
      window.removeEventListener(TRANSACTION_SYNCED_EVENT, synced);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return {
    online,
    pending,
    failed,
    syncError,
    retry: () => {
      void (failed > 0 ? retryFailedOutbox() : syncTransactionOutbox())
        .then(() => setSyncError(null))
        .catch((cause: unknown) =>
          setSyncError(
            cause instanceof Error
              ? cause.message
              : "Sinkronisasi belum dapat dijalankan.",
          ),
        );
    },
  };
}
