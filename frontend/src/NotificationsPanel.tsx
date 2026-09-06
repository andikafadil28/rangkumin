import { useEffect, useState } from "react";
import { getNotifications, markNotificationRead } from "./api";
import type { Notification } from "./api";

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function NotificationsPanel({
  onClose,
  onRead,
}: {
  onClose: () => void;
  onRead: () => void;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getNotifications(controller.signal)
      .then(({ notifications }) => setItems(notifications))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.VITE_DEMO_MODE === "true") {
          setItems([
            {
              id: "notification-demo",
              kind: "budget_threshold",
              title: "Anggaran Hiburan mencapai 75%",
              body: "Pemakaian bulan ini sudah mendekati batas yang kalian tentukan.",
              scheduledFor: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              readAt: null,
            },
          ]);
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Notifikasi belum dapat dimuat.",
        );
      })
      .finally(() => setLoading(false));
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      controller.abort();
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

  async function read(item: Notification) {
    if (item.readAt) return;
    try {
      await markNotificationRead(item.id);
    } catch (cause) {
      if (!(
        import.meta.env.VITE_DEMO_MODE === "true" && cause instanceof TypeError
      ))
        return;
    }
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, readAt: new Date().toISOString() }
          : entry,
      ),
    );
    onRead();
  }

  return (
    <div className="notification-layer" onMouseDown={onClose}>
      <aside
        className="notification-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="notification-heading">
          <div>
            <p className="eyebrow">Yang perlu dilihat</p>
            <h2 id="notification-title">Notifikasi</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup notifikasi">
            ×
          </button>
        </div>
        {loading ? (
          <div className="notification-loading">
            <i />
            <i />
            <i />
          </div>
        ) : error ? (
          <div className="empty-state">
            <span>Belum tersambung</span>
            <p>{error}</p>
          </div>
        ) : items.length ? (
          <ul>
            {items.map((item) => (
              <li className={item.readAt ? "" : "unread"} key={item.id}>
                <button type="button" onClick={() => void read(item)}>
                  <i />
                  <span>
                    <b>{item.title}</b>
                    <p>{item.body}</p>
                    <small>
                      {dateTime.format(new Date(item.createdAt))} WIB
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <span>Semua tenang</span>
            <p>Belum ada notifikasi baru.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
