import { useEffect, useState } from "react";
import {
  getPushStatus,
  removePushSubscription,
  savePushSubscription,
} from "./api";
import { clearOfflineDataSafely } from "./offline/sync";
import type { ViewMode } from "./viewMode";
import {
  createBrowserPushDependencies,
  disablePushSubscription,
  enablePushSubscription,
  getPushAvailability,
  getPushDeviceId,
  reconcilePushSubscription,
  unsubscribePushBestEffort,
} from "./webPush";

type Theme = "together" | "calm" | "minimal";

export function SettingsPage({
  displayName,
  theme,
  balancesHidden,
  viewMode,
  onViewModeChange,
  onThemeChange,
  onBalanceToggle,
  onOpenTrash,
  onOpenDataTransfer,
  offlineCount,
}: {
  displayName: string;
  theme: Theme;
  balancesHidden: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onThemeChange: (theme: Theme) => void;
  onBalanceToggle: () => void;
  onOpenTrash: () => void;
  onOpenDataTransfer: () => void;
  offlineCount: number;
}) {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(true);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const pushAvailability = getPushAvailability();
  const pushDependencies = createBrowserPushDependencies({
    getStatus: getPushStatus,
    save: savePushSubscription,
    remove: removePushSubscription,
  });

  useEffect(() => {
    if (!pushAvailability.supported) {
      setPushBusy(false);
      setPushMessage(pushAvailability.message);
      return;
    }
    let active = true;
    reconcilePushSubscription(getPushDeviceId(), pushDependencies)
      .then((enabled) => {
        if (active) setPushEnabled(enabled);
      })
      .catch(() => {
        if (active)
          setPushMessage("Status notifikasi belum dapat diperiksa saat ini.");
      })
      .finally(() => {
        if (active) setPushBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function togglePush() {
    if (!pushAvailability.supported) return;
    setPushBusy(true);
    setPushMessage(null);
    try {
      const deviceId = getPushDeviceId();
      if (pushEnabled) {
        await disablePushSubscription(deviceId, pushDependencies);
        setPushEnabled(false);
        setPushMessage("Notifikasi perangkat sudah dinonaktifkan.");
      } else {
        await enablePushSubscription(deviceId, pushDependencies);
        setPushEnabled(true);
        setPushMessage("Notifikasi perangkat sudah aktif.");
      }
    } catch (error) {
      setPushMessage(
        error instanceof Error
          ? error.message
          : "Pengaturan notifikasi belum dapat disimpan.",
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function clearDevice() {
    if (
      !window.confirm(
        "Hapus snapshot dan transaksi offline dari perangkat ini? Data yang sudah tersimpan di server tidak terpengaruh.",
      )
    )
      return;
    setClearing(true);
    setStorageError(null);
    try {
      await clearOfflineDataSafely();
      setCleared(true);
      window.dispatchEvent(new Event("rangkumin:outbox-changed"));
    } catch {
      setStorageError("Data offline belum dapat dihapus. Coba sekali lagi.");
    } finally {
      setClearing(false);
    }
  }

  async function logout() {
    const warning =
      offlineCount > 0
        ? `Masih ada ${offlineCount} transaksi yang belum selesai disinkronkan. Keluar sekarang akan menghapus antrean tersebut dari perangkat.`
        : "Keluar dari Rangkumin di perangkat ini?";
    if (!window.confirm(warning)) return;

    setLoggingOut(true);
    setStorageError(null);
    try {
      if (pushAvailability.supported) {
        await unsubscribePushBestEffort(pushDependencies);
      }
      await clearOfflineDataSafely();
      window.location.assign("/cdn-cgi/access/logout");
    } catch {
      setStorageError(
        "Data offline gagal dibersihkan, sehingga logout dibatalkan. Coba sekali lagi.",
      );
      setLoggingOut(false);
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ruang yang terasa milikmu</p>
          <h1 id="settings-title">Pengaturan</h1>
          <p>Atur suasana dan privasi tampilan di perangkat ini.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card profile-setting">
          <span className="settings-avatar">{displayName.charAt(0)}</span>
          <div>
            <p className="eyebrow">Akun aktif</p>
            <h2>{displayName}</h2>
            <span>Terhubung aman melalui Cloudflare Access</span>
          </div>
        </section>
        <section className="settings-card">
          <div className="setting-copy">
            <h2>Suasana tampilan</h2>
            <p>Pilihan disimpan hanya di browser ini.</p>
          </div>
          <div className="large-theme-picker">
            <button
              type="button"
              aria-pressed={theme === "together"}
              onClick={() => onThemeChange("together")}
            >
              <i className="together-swatch" />
              <span>
                <b>Bersama</b>
                <small>Hangat dan lembut</small>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={theme === "calm"}
              onClick={() => onThemeChange("calm")}
            >
              <i className="calm-swatch" />
              <span>
                <b>Tenang</b>
                <small>Teduh dan fokus</small>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={theme === "minimal"}
              onClick={() => onThemeChange("minimal")}
            >
              <i className="minimal-swatch" />
              <span>
                <b>Minimal</b>
                <small>Lugas dan fokus</small>
              </span>
            </button>
          </div>
        </section>
        <section className="settings-card">
          <div className="setting-copy">
            <h2>Tampilan keuangan</h2>
            <p>
              Pilih menampilkan data berdua atau hanya punyamu. Tidak mengubah
              data apa pun dan hanya berlaku di perangkat ini.
            </p>
          </div>
          <div
            className="view-picker"
            role="group"
            aria-label="Cakupan tampilan"
          >
            <button
              type="button"
              aria-pressed={viewMode === "couple"}
              onClick={() => onViewModeChange("couple")}
            >
              <b>Tampilan bersama</b>
              <small>Semua data dan pos berdua</small>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "solo"}
              onClick={() => onViewModeChange("solo")}
            >
              <b>Tampilan saya</b>
              <small>Hanya data dan pos milikmu</small>
            </button>
          </div>
        </section>
        <section className="settings-card setting-row">
          <div className="setting-copy">
            <h2>Notifikasi perangkat</h2>
            <p>
              Terima pengingat dan kabar penting meski Rangkumin sedang tidak
              dibuka. Pengaturan ini hanya berlaku di perangkat ini.
            </p>
            {pushMessage && (
              <small
                className={!pushAvailability.supported ? "form-error" : ""}
                role={pushAvailability.supported ? "status" : "alert"}
              >
                {pushMessage}
              </small>
            )}
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={pushBusy || !pushAvailability.supported}
            onClick={() => void togglePush()}
          >
            {pushBusy
              ? "Memeriksa..."
              : pushEnabled
                ? "Nonaktifkan"
                : "Aktifkan"}
          </button>
        </section>
        <section className="settings-card setting-row">
          <div className="setting-copy">
            <h2>Import & export data</h2>
            <p>
              Download salinan CSV/XLSX atau import data dengan preview dan
              validasi terlebih dahulu.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenDataTransfer}
          >
            Kelola data
          </button>
        </section>
        <section className="settings-card setting-row">
          <div className="setting-copy">
            <h2>Privasi nominal</h2>
            <p>
              Sembunyikan seluruh angka saat membuka aplikasi di tempat umum.
            </p>
          </div>
          <button
            className="toggle-switch"
            type="button"
            role="switch"
            aria-checked={balancesHidden}
            onClick={onBalanceToggle}
          >
            <i />
          </button>
        </section>
        <section className="settings-card setting-row">
          <div className="setting-copy">
            <h2>Trash transaksi</h2>
            <p>
              Pulihkan catatan atau hapus permanen sebelum masa simpan 30 hari
              berakhir.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenTrash}
          >
            Buka Trash
          </button>
        </section>
        <section className="settings-card setting-row">
          <div className="setting-copy">
            <h2>Data offline perangkat</h2>
            <p>
              Snapshot terakhir dan antrean transaksi disimpan di browser ini.
              {offlineCount > 0
                ? ` Ada ${offlineCount} transaksi yang belum selesai disinkronkan.`
                : " Tidak ada transaksi yang menunggu sinkronisasi."}
            </p>
            {cleared && (
              <small role="status">Data offline sudah dihapus.</small>
            )}
            {storageError && (
              <small className="form-error" role="alert">
                {storageError}
              </small>
            )}
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={clearing}
            onClick={() => void clearDevice()}
          >
            {clearing ? "Menghapus..." : "Hapus data offline"}
          </button>
        </section>
        <section className="settings-card setting-row logout-setting">
          <div className="setting-copy">
            <h2>Keluar dari akun</h2>
            <p>
              Sesi Cloudflare Access dan data offline di perangkat ini akan
              dibersihkan.
            </p>
          </div>
          <button
            className="danger-button"
            type="button"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Keluar..." : "Keluar"}
          </button>
        </section>
        <aside className="settings-note">
          <b>Tentang data kalian</b>
          <p>
            Rangkumin tidak menyimpan pengaturan visual ini di server. Data
            keuangan tetap dilindungi oleh ownership guard backend.
          </p>
        </aside>
      </div>
    </section>
  );
}
