import { useEffect, useState } from "react";
import { AuthRequiredError } from "./api";
import type { SummaryItem, Transaction, getDashboard } from "./api";
import { TransactionsPage } from "./TransactionsPage";
import { SavingsPage } from "./SavingsPage";
import { PlansPage } from "./PlansPage";
import { SettingsPage } from "./SettingsPage";
import { DataTransferPage } from "./DataTransferPage";
import { NotificationsPanel } from "./NotificationsPanel";
import { useAutoRefresh } from "./useAutoRefresh";
import { loadDashboardSnapshot } from "./offline/snapshots";
import { useOfflineSync } from "./offline/useOfflineSync";
import { partitionGoals, setViewMode, getViewMode } from "./viewMode";
import type { ViewMode } from "./viewMode";
import { DEMO_MODE } from "./demoMode";

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
type Theme = "together" | "calm" | "minimal";
type Page =
  "home" | "transactions" | "savings" | "plans" | "settings" | "data-transfer";

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateLabel = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function Icon({
  name,
}: {
  name:
    | "home"
    | "wallet"
    | "target"
    | "calendar"
    | "settings"
    | "bell"
    | "arrow"
    | "eye"
    | "eyeOff"
    | "plus"
    | "close";
}) {
  const paths = {
    home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    wallet:
      "M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12v4m0 5h4",
    target:
      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-5h.01",
    calendar: "M6 2v4m12-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v15H3V6a2 2 0 0 1 2-2Z",
    settings:
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.8 7.8 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.8-1L14.6 3h-4L10 6a8 8 0 0 0-1.8 1L5.7 6 3.8 9.4l2 1.6a8 8 0 0 0 0 2l-2 1.6L5.7 18l2.5-1a8 8 0 0 0 1.8 1l.5 3h4l.5-3a8 8 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6a7.8 7.8 0 0 0 .1-1Z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4",
    arrow: "m9 18 6-6-6-6",
    eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    eyeOff:
      "m3 3 18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-2.1 2.8M6.6 6.6C3.6 8.3 2 12 2 12s3.5 6 10 6a10.4 10.4 0 0 0 3.4-.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
    plus: "M12 5v14M5 12h14",
    close: "M6 6l12 12M18 6 6 18",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

const navItems = [
  ["home", "Beranda", "home"],
  ["transactions", "Transaksi", "wallet"],
  ["savings", "Tabungan", "target"],
  ["plans", "Rencana", "calendar"],
  ["settings", "Pengaturan", "settings"],
] as const;

function formatPeriod(from: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${from}T12:00:00`));
}

function formatMoney(value: number, hidden: boolean) {
  return hidden ? "Rp ••••••" : money.format(value);
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function PersonCard({
  item,
  current,
  balance,
  hidden,
}: {
  item: SummaryItem;
  current: boolean;
  balance: number;
  hidden: boolean;
}) {
  return (
    <article className={`person-card ${current ? "is-current" : ""}`}>
      <div className="person-head">
        <span className="avatar" aria-hidden="true">
          {current ? "K" : "P"}
        </span>
        <div>
          <span className="quiet-label">
            {current ? "Milikmu" : "Pasangan"}
          </span>
          <h3>{current ? "Kamu" : "Dia"}</h3>
        </div>
        <span className={`net-pill ${item.net < 0 ? "negative" : ""}`}>
          {item.net < 0 ? "−" : "+"}
          {formatMoney(Math.abs(item.net), hidden)}
        </span>
      </div>
      <p className="balance-label">Saldo tunai</p>
      <p className="person-balance">{formatMoney(balance, hidden)}</p>
      <div className="money-pair">
        <span>
          <i className="dot income" />
          Masuk <b>{formatMoney(item.income, hidden)}</b>
        </span>
        <span>
          <i className="dot expense" />
          Keluar <b>{formatMoney(item.expense, hidden)}</b>
        </span>
      </div>
    </article>
  );
}

function TransactionRow({
  item,
  currentUserId,
  hidden,
}: {
  item: Transaction;
  currentUserId: string;
  hidden: boolean;
}) {
  const income = item.type === "income";
  const saving = item.type.startsWith("saving_");
  const tone = saving ? "saving" : income ? "income" : "expense";
  return (
    <li className="transaction-row">
      <span className={`transaction-mark ${tone}`}>
        {saving ? "◎" : income ? "↙" : "↗"}
      </span>
      <span className="transaction-copy">
        <b>
          {item.description ||
            item.category?.name ||
            (income ? "Pemasukan" : "Pengeluaran")}
        </b>
        <small>
          {item.ownerUserId === currentUserId ? "Kamu" : "Pasangan"} ·{" "}
          {dateLabel.format(new Date(`${item.transactionDate}T12:00:00`))}
        </small>
        {item.category && (
          <em className={`category-chip tone-${item.category.name.length % 4}`}>
            {item.category.name}
          </em>
        )}
      </span>
      <strong className={saving ? "" : income ? "positive" : "negative"}>
        {saving ? "" : income ? "+" : "−"}
        {formatMoney(item.amount, hidden)}
      </strong>
    </li>
  );
}

function DashboardCharts({
  data,
  hidden,
}: {
  data: DashboardData;
  hidden: boolean;
}) {
  const combined = data.summary.combined;
  const flowMax = Math.max(combined.income, combined.expense, 1);
  const categories = combined.categories.slice(0, 5);
  const categoryMax = Math.max(...categories.map((item) => item.total), 1);
  return (
    <section className="chart-grid" aria-label="Grafik keuangan bulan ini">
      <article className="chart-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Arus bulan ini</p>
            <h2>Masuk dan keluar</h2>
          </div>
        </div>
        <div className="flow-chart">
          <div>
            <span>Pemasukan</span>
            <i>
              <b style={{ width: `${(combined.income / flowMax) * 100}%` }} />
            </i>
            <strong>{formatMoney(combined.income, hidden)}</strong>
          </div>
          <div>
            <span>Pengeluaran</span>
            <i>
              <b style={{ width: `${(combined.expense / flowMax) * 100}%` }} />
            </i>
            <strong>{formatMoney(combined.expense, hidden)}</strong>
          </div>
        </div>
      </article>
      <article className="chart-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Ke mana perginya</p>
            <h2>Kategori pengeluaran</h2>
          </div>
        </div>
        {categories.length ? (
          <div className="category-chart">
            {categories.map((item, index) => (
              <div key={item.categoryId}>
                <span>
                  <i className={`chart-dot tone-${index}`} />
                  {item.name}
                </span>
                <b>{hidden ? "•••" : money.format(item.total)}</b>
                <em>
                  <i
                    style={{ width: `${(item.total / categoryMax) * 100}%` }}
                  />
                </em>
              </div>
            ))}
          </div>
        ) : (
          <div className="chart-empty">Belum cukup data bulan ini.</div>
        )}
      </article>
    </section>
  );
}

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const offline = useOfflineSync(() => setReload((value) => value + 1));
  useAutoRefresh(() => setReload((value) => value + 1), 10_000, offline.online);
  const [snapshotState, setSnapshotState] = useState<{
    stale: boolean;
    syncedAt: string | null;
  }>({ stale: false, syncedAt: null });
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = document.documentElement.dataset.theme;
    return saved === "calm" || saved === "minimal" ? saved : "together";
  });
  const [balancesHidden, setBalancesHidden] = useState(
    () => localStorage.getItem("rangkumin-hide-balances") === "true",
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getViewMode());
  const [quickOpen, setQuickOpen] = useState(false);
  const [activePage, setActivePage] = useState<Page>("home");
  const [transactionIntent, setTransactionIntent] = useState<
    "income" | "expense" | null
  >(null);
  const [savingsIntent, setSavingsIntent] = useState(false);
  const [trashIntent, setTrashIntent] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    loadDashboardSnapshot(controller.signal, viewMode === "solo")
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result.data);
        setSnapshotState({ stale: result.stale, syncedAt: result.syncedAt });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.VITE_DEMO_MODE === "true") {
          void import("./demo").then(({ demoDashboard }) =>
            setData(demoDashboard),
          );
          return;
        }
        setSnapshotState((current) => ({ ...current, stale: true }));
        if (cause instanceof AuthRequiredError) setData(null);
        setError(
          cause instanceof Error ? cause.message : "Data belum dapat dimuat.",
        );
      });
    return () => controller.abort();
  }, [reload, viewMode]);

  useEffect(() => {
    if (!quickOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [quickOpen]);

  function selectTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    const tone =
      next === "calm" ? "#f3f0e8" : next === "minimal" ? "#f7f7f4" : "#f8f0e9";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", tone);
    localStorage.setItem("rangkumin-theme", next);
    setTheme(next);
  }

  function toggleBalances() {
    const next = !balancesHidden;
    localStorage.setItem("rangkumin-hide-balances", String(next));
    setBalancesHidden(next);
  }

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    setViewModeState(next);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#main-content"
          aria-label="Rangkumin, beranda"
        >
          <BrandMark />
          <b>Rangkumin</b>
        </a>
        <nav aria-label="Navigasi utama">
          {navItems.map(([page, label, icon]) => (
            <button
              className={
                activePage === page ||
                (page === "settings" && activePage === "data-transfer")
                  ? "active"
                  : ""
              }
              key={label}
              type="button"
              aria-current={
                activePage === page ||
                (page === "settings" && activePage === "data-transfer")
                  ? "page"
                  : undefined
              }
              onClick={() => setActivePage(page)}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>Catatan kecil</span>
          <p>
            {theme === "together"
              ? "Sedikit demi sedikit, rencana berdua jadi lebih dekat."
              : theme === "minimal"
                ? "Tanpa riuh, tumbuh tenang. Catat yang penting, lewati sisanya."
                : "Keuangan yang tenang dimulai dari langkah kecil yang teratur."}
          </p>
        </div>
        <p className="sidebar-date">{dateLabel.format(new Date())}</p>
      </aside>

      <main id="main-content" className="main-content">
        {DEMO_MODE && (
          <aside className="demo-banner" aria-label="Informasi demo publik">
            <div>
              <b>Mode demo publik</b>
              <span>
                Semua data hanya contoh. Perubahan tersimpan sementara di tab
                ini dan direset saat halaman dimuat ulang.
              </span>
            </div>
            <nav aria-label="Tautan demo">
              <a
                href="https://github.com/andikafadil28/rangkumin#dokumentasi-setup"
                target="_blank"
                rel="noreferrer"
              >
                Dokumentasi
              </a>
              <a
                href="https://github.com/andikafadil28/rangkumin/blob/main/COMMERCIAL.md"
                target="_blank"
                rel="noreferrer"
              >
                Layanan setup
              </a>
            </nav>
          </aside>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {theme === "together"
                ? "Ruang keuangan kalian"
                : theme === "minimal"
                  ? "Ruang keuangan yang lugas"
                  : "Ruang keuangan yang tenang"}
            </p>
            <h1>
              {data
                ? `Halo, ${data.user.displayName.split(" ")[0]}`
                : "Halo, kalian"}
            </h1>
            <p className="subtitle">
              {theme === "together"
                ? "Satu pandangan tenang untuk keputusan berdua."
                : theme === "minimal"
                  ? "Hal-hal penting, tanpa yang tidak perlu."
                  : "Melihat yang penting, tanpa terasa ramai."}
            </p>
          </div>
          <div className="top-actions">
            <button
              className="quick-add desktop-quick"
              type="button"
              onClick={() => setQuickOpen(true)}
            >
              <Icon name="plus" /> Catat
            </button>
            <div className="theme-switch" aria-label="Pilih suasana tampilan">
              <button
                type="button"
                aria-pressed={theme === "together"}
                onClick={() => selectTheme("together")}
              >
                Bersama
              </button>
              <button
                type="button"
                aria-pressed={theme === "calm"}
                onClick={() => selectTheme("calm")}
              >
                Tenang
              </button>
              <button
                type="button"
                aria-pressed={theme === "minimal"}
                onClick={() => selectTheme("minimal")}
              >
                Minimal
              </button>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={toggleBalances}
              aria-label={
                balancesHidden
                  ? "Tampilkan semua nominal"
                  : "Sembunyikan semua nominal"
              }
              aria-pressed={balancesHidden}
            >
              <Icon name={balancesHidden ? "eyeOff" : "eye"} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`${data?.unread ?? 0} notifikasi belum dibaca`}
            >
              <Icon name="bell" />
              {Boolean(data?.unread) && <span>{data!.unread}</span>}
            </button>
            <button
              className="mini-avatar"
              type="button"
              onClick={() => setActivePage("settings")}
              aria-label="Buka pengaturan"
            >
              {data?.user.displayName.charAt(0) || "R"}
            </button>
          </div>
        </header>

        {(!offline.online ||
          snapshotState.stale ||
          offline.pending > 0 ||
          offline.failed > 0 ||
          offline.syncError) && (
          <div
            className={`sync-banner ${offline.online ? "" : "is-offline"}`}
            role="status"
          >
            <b>{offline.online ? "Sinkronisasi perangkat" : "Mode offline"}</b>
            <span>
              {offline.syncError
                ? offline.syncError
                : offline.failed > 0
                  ? `${offline.failed} transaksi perlu diperiksa.`
                  : offline.pending > 0
                    ? `${offline.pending} transaksi menunggu sinkronisasi.`
                    : snapshotState.syncedAt
                      ? `Menampilkan data terakhir ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshotState.syncedAt))}.`
                      : "Perubahan online-only dinonaktifkan sampai koneksi kembali."}
            </span>
            {offline.online && (offline.pending > 0 || offline.failed > 0) && (
              <button type="button" onClick={offline.retry}>
                Coba sinkronkan
              </button>
            )}
          </div>
        )}

        {activePage === "data-transfer" && data ? (
          <DataTransferPage
            userId={data.user.id}
            partnerId={
              data.summary.byUser.find((item) => item.userId !== data.user.id)
                ?.userId
            }
            viewMode={viewMode}
            online={offline.online && !snapshotState.stale}
            onBack={() => setActivePage("settings")}
          />
        ) : activePage === "transactions" && data ? (
          <TransactionsPage
            userId={data.user.id}
            initialCategories={data.categories}
            partnerId={
              data.summary.byUser.find((item) => item.userId !== data.user.id)
                ?.userId
            }
            viewMode={viewMode}
            hidden={balancesHidden}
            intent={transactionIntent}
            onIntentHandled={() => setTransactionIntent(null)}
            openTrash={trashIntent}
            onTrashHandled={() => setTrashIntent(false)}
            online={offline.online && !snapshotState.stale}
          />
        ) : activePage === "savings" && data ? (
          <SavingsPage
            userId={data.user.id}
            viewMode={viewMode}
            hidden={balancesHidden}
            openCreate={savingsIntent}
            onCreateHandled={() => setSavingsIntent(false)}
            online={offline.online && !snapshotState.stale}
          />
        ) : activePage === "plans" && data ? (
          <PlansPage
            userId={data.user.id}
            allUserIds={data.summary.byUser.map((item) => item.userId)}
            viewMode={viewMode}
            hidden={balancesHidden}
            online={offline.online && !snapshotState.stale}
          />
        ) : activePage === "settings" && data ? (
          <SettingsPage
            displayName={data.user.displayName}
            theme={theme}
            balancesHidden={balancesHidden}
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
            onThemeChange={selectTheme}
            onBalanceToggle={toggleBalances}
            onOpenTrash={() => {
              setTrashIntent(true);
              setActivePage("transactions");
            }}
            onOpenDataTransfer={() => setActivePage("data-transfer")}
            offlineCount={offline.pending + offline.failed}
          />
        ) : activePage !== "home" ? (
          <section className="coming-page">
            <BrandMark />
            <p className="eyebrow">Checkpoint berikutnya</p>
            <h1>{navItems.find(([page]) => page === activePage)?.[1]}</h1>
            <p>Ruang ini sedang disiapkan dengan bahasa visual yang sama.</p>
            <button type="button" onClick={() => setActivePage("home")}>
              Kembali ke beranda
            </button>
          </section>
        ) : !data ? (
          error ? (
            <section className="state-card" role="alert">
              <span>Data belum tersambung</span>
              <h2>Kita coba sekali lagi.</h2>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
              >
                Muat ulang
              </button>
            </section>
          ) : (
            <section className="loading-grid" aria-label="Memuat dashboard">
              <div />
              <div />
              <div />
              <div />
            </section>
          )
        ) : (
          <div className="dashboard">
            <div
              className="view-switch"
              role="group"
              aria-label="Pilih cakupan data"
            >
              <button
                type="button"
                aria-pressed={viewMode === "couple"}
                onClick={() => changeViewMode("couple")}
              >
                Tampilan bersama
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "solo"}
                onClick={() => changeViewMode("solo")}
              >
                Tampilan saya
              </button>
            </div>
            <section className="section-block" aria-labelledby="personal-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Bulan ini</p>
                  <h2 id="personal-title">
                    {viewMode === "solo"
                      ? "Ceritamu bulan ini"
                      : "Cerita masing-masing"}
                  </h2>
                </div>
                <span className="period-chip">
                  {formatPeriod(data.summary.period.from)}
                </span>
              </div>
              <div className="people-grid">
                {data.summary.byUser.map((item) => (
                  <PersonCard
                    key={item.userId}
                    item={item}
                    current={item.userId === data.user.id}
                    balance={
                      data.savings.cashBalances.find(
                        (balance) => balance.userId === item.userId,
                      )?.balance ?? 0
                    }
                    hidden={balancesHidden}
                  />
                ))}
              </div>
            </section>

            <section className="together-card" aria-labelledby="together-title">
              <div>
                <p className="eyebrow light">
                  {viewMode === "solo" ? "Untukmu" : "Kalau digabung"}
                </p>
                <h2 id="together-title">
                  {viewMode === "solo"
                    ? "Langkahmu bulan ini"
                    : "Langkah kalian bulan ini"}
                </h2>
                <p className="together-net">
                  {formatMoney(data.summary.combined.net, balancesHidden)}
                </p>
                <span className="together-caption">
                  {viewMode === "solo"
                    ? "Selisih pemasukan dan pengeluaranmu"
                    : "Selisih pemasukan dan pengeluaran bersama"}
                </span>
              </div>
              <div className="together-stats">
                <div>
                  <span>Total masuk</span>
                  <b>
                    {formatMoney(data.summary.combined.income, balancesHidden)}
                  </b>
                </div>
                <div>
                  <span>Total keluar</span>
                  <b>
                    {formatMoney(data.summary.combined.expense, balancesHidden)}
                  </b>
                </div>
                <div
                  className="ratio-track"
                  aria-label="Perbandingan pemasukan dan pengeluaran"
                >
                  <i
                    style={{
                      width: `${Math.min(100, data.summary.combined.income ? (data.summary.combined.expense / data.summary.combined.income) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            <DashboardCharts data={data} hidden={balancesHidden} />

            <div className="content-grid">
              <section className="panel" aria-labelledby="saving-title">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">
                      {viewMode === "solo" ? "Tujuanmu" : "Tujuan bersama"}
                    </p>
                    <h2 id="saving-title">Tabungan</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setActivePage("savings")}
                  >
                    Lihat semua <Icon name="arrow" />
                  </button>
                </div>
                {partitionGoals(
                  data.savings.goals.filter((goal) => !goal.archivedAt),
                  data.user.id,
                  viewMode,
                ).length ? (
                  <ul className="goal-list">
                    {partitionGoals(
                      data.savings.goals.filter((goal) => !goal.archivedAt),
                      data.user.id,
                      viewMode,
                    )
                      .slice(0, 3)
                      .map((goal) => (
                        <li key={goal.id}>
                          <div>
                            <b>{goal.name}</b>
                            <span
                              className={`scope-badge ${goal.ownershipScope}`}
                            >
                              {goal.ownershipScope === "shared"
                                ? "Bersama"
                                : goal.ownerUserId === data.user.id
                                  ? "Milikmu"
                                  : "Milik pasangan"}
                            </span>
                          </div>
                          <strong>
                            {formatMoney(goal.balance, balancesHidden)}
                          </strong>
                          <div className="progress">
                            <i
                              style={{
                                width: `${Math.min(100, goal.progressPercentage ?? 0)}%`,
                              }}
                            />
                          </div>
                          <small>
                            {goal.targetAmount
                              ? `${Math.round(goal.progressPercentage ?? 0)}% dari ${formatMoney(goal.targetAmount, balancesHidden)}`
                              : "Tanpa target"}
                          </small>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="empty-state">
                    <span>Belum ada tujuan</span>
                    <p>
                      {viewMode === "solo"
                        ? "Mulai dari sesuatu yang ingin kamu capai."
                        : "Mulai dari sesuatu yang ingin kalian capai bersama."}
                    </p>
                  </div>
                )}
              </section>

              <section
                className="panel activity-panel"
                aria-labelledby="activity-title"
              >
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Paling baru</p>
                    <h2 id="activity-title">Aktivitas</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setActivePage("transactions")}
                  >
                    Riwayat <Icon name="arrow" />
                  </button>
                </div>
                {data.transactions.some(
                  (item) =>
                    viewMode !== "solo" || item.ownerUserId === data.user.id,
                ) ? (
                  <ul className="transaction-list">
                    {data.transactions
                      .filter(
                        (item) =>
                          viewMode !== "solo" ||
                          item.ownerUserId === data.user.id,
                      )
                      .map((item) => (
                        <TransactionRow
                          key={item.id}
                          item={item}
                          currentUserId={data.user.id}
                          hidden={balancesHidden}
                        />
                      ))}
                  </ul>
                ) : (
                  <div className="empty-state">
                    <span>Masih tenang</span>
                    <p>Transaksi terbaru akan muncul di sini.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      <button
        className="mobile-quick"
        type="button"
        onClick={() => setQuickOpen(true)}
        aria-label="Buka menu catat"
      >
        <Icon name="plus" />
      </button>

      {quickOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={() => setQuickOpen(false)}
        >
          <section
            className="quick-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              type="button"
              autoFocus
              onClick={() => setQuickOpen(false)}
              aria-label="Tutup menu catat"
            >
              <Icon name="close" />
            </button>
            <BrandMark />
            <p className="eyebrow">Catatan baru</p>
            <h2 id="quick-title">Apa yang mau dicatat?</h2>
            <div className="quick-options">
              <button
                type="button"
                onClick={() => {
                  setTransactionIntent("income");
                  setActivePage("transactions");
                  setQuickOpen(false);
                }}
              >
                <i className="option-icon income">↙</i>
                <span>
                  <b>Pemasukan</b>
                  <small>Uang yang baru masuk</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransactionIntent("expense");
                  setActivePage("transactions");
                  setQuickOpen(false);
                }}
              >
                <i className="option-icon expense">↗</i>
                <span>
                  <b>Pengeluaran</b>
                  <small>Kebutuhan hari ini</small>
                </span>
              </button>
              <button
                type="button"
                disabled={!offline.online || snapshotState.stale}
                onClick={() => {
                  setSavingsIntent(true);
                  setActivePage("savings");
                  setQuickOpen(false);
                }}
              >
                <i className="option-icon saving">◎</i>
                <span>
                  <b>Tabungan</b>
                  <small>Dekatkan sebuah tujuan</small>
                </span>
              </button>
            </div>
            <p className="preview-note">Pilih salah satu untuk melanjutkan.</p>
          </section>
        </div>
      )}

      {notificationsOpen && (
        <NotificationsPanel
          onClose={() => setNotificationsOpen(false)}
          onRead={() =>
            setData((current) =>
              current
                ? { ...current, unread: Math.max(0, current.unread - 1) }
                : current,
            )
          }
        />
      )}

      <nav className="mobile-nav" aria-label="Navigasi mobile">
        {navItems.map(([page, label, icon]) => (
          <button
            className={
              activePage === page ||
              (page === "settings" && activePage === "data-transfer")
                ? "active"
                : ""
            }
            key={label}
            type="button"
            aria-current={
              activePage === page ||
              (page === "settings" && activePage === "data-transfer")
                ? "page"
                : undefined
            }
            onClick={() => setActivePage(page)}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
