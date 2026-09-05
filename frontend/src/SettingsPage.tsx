type Theme = "together" | "calm" | "minimal";

export function SettingsPage({
  displayName,
  theme,
  balancesHidden,
  onThemeChange,
  onBalanceToggle,
  onOpenTrash,
}: {
  displayName: string;
  theme: Theme;
  balancesHidden: boolean;
  onThemeChange: (theme: Theme) => void;
  onBalanceToggle: () => void;
  onOpenTrash: () => void;
}) {
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
