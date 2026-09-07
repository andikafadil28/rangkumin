import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAutoRefresh } from "./useAutoRefresh";
import {
  deleteTransaction,
  getCategories,
  getTransactions,
  getTrashedTransactions,
  purgeTransaction,
  restoreTransaction,
  scanReceipt,
  updateTransaction,
} from "./api";
import type { Category, Transaction } from "./api";
import { loadWithSnapshot } from "./offline/snapshots";
import { getOutboxItems } from "./offline/db";
import type { TransactionOutboxItem } from "./offline/db";
import {
  OUTBOX_CHANGED_EVENT,
  TRANSACTION_SYNCED_EVENT,
  createOrQueueTransaction,
} from "./offline/sync";
import type { ViewMode } from "./viewMode";
import { combineReceiptDescription, prepareReceiptImage } from "./receiptImage";
import { DEMO_MODE } from "./demoMode";

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const demoCategories: Category[] = [
  {
    id: "income-salary",
    type: "income",
    name: "Gaji",
    isDefault: true,
    isActive: true,
  },
  {
    id: "income-other",
    type: "income",
    name: "Lainnya",
    isDefault: true,
    isActive: true,
  },
  {
    id: "expense-food",
    type: "expense",
    name: "Makanan & Minuman",
    isDefault: true,
    isActive: true,
  },
  {
    id: "expense-shopping",
    type: "expense",
    name: "Belanja",
    isDefault: true,
    isActive: true,
  },
  {
    id: "expense-bills",
    type: "expense",
    name: "Tagihan & Cicilan",
    isDefault: true,
    isActive: true,
  },
];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayMoney(value: number, hidden: boolean) {
  return hidden ? "Rp ••••••" : money.format(value);
}

type TransactionType = "income" | "expense";
type ReceiptScanResult = {
  draft: {
    type: "expense";
    amount: number | null;
    transactionDate: string | null;
    merchant: string | null;
    description: string | null;
    categoryId: string | null;
    categoryName: string | null;
  };
  confidence: "low" | "medium" | "high";
  warnings: string[];
};

function TransactionForm({
  initialType,
  transaction,
  categories,
  actorUserId,
  online,
  onClose,
  onSaved,
}: {
  initialType: TransactionType;
  transaction?: Transaction;
  categories: Category[];
  actorUserId: string;
  online: boolean;
  onClose: () => void;
  onSaved: (queued: boolean) => void;
}) {
  const [type, setType] = useState<TransactionType>(
    transaction?.type === "income" ? "income" : initialType,
  );
  const [amount, setAmount] = useState(
    transaction ? String(transaction.amount) : "",
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ?? transaction?.category?.id ?? "",
  );
  const [date, setDate] = useState(transaction?.transactionDate ?? today);
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptScanResult>();
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null,
  );
  const availableCategories = categories.filter(
    (item) => item.type === type && item.isActive,
  );

  useEffect(
    () => () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    },
    [receiptPreviewUrl],
  );

  function changeType(next: TransactionType) {
    setFieldsDirty(true);
    setType(next);
    setCategoryId("");
  }

  async function scanSelectedReceipt(file: File | undefined) {
    if (!file || transaction || !online) return;
    if (
      fieldsDirty &&
      !window.confirm(
        "Hasil scan akan mengganti isian yang sudah kamu ubah. Lanjutkan?",
      )
    ) {
      return;
    }

    setScanning(true);
    setError(null);
    try {
      const preparedFile = await prepareReceiptImage(file);
      const result: ReceiptScanResult = await scanReceipt(preparedFile);
      const draft = result.draft;
      setType("expense");
      if (draft.amount !== null) setAmount(String(draft.amount));
      if (draft.transactionDate !== null) setDate(draft.transactionDate);
      const scannedDescription = combineReceiptDescription(
        draft.merchant,
        draft.description,
      );
      if (scannedDescription) setDescription(scannedDescription);
      if (draft.categoryId !== null || draft.categoryName !== null) {
        const matchedCategory = categories.find(
          (item) =>
            item.type === "expense" &&
            item.isActive &&
            (item.id === draft.categoryId ||
              item.name.localeCompare(draft.categoryName ?? "", undefined, {
                sensitivity: "accent",
              }) === 0),
        );
        if (matchedCategory) setCategoryId(matchedCategory.id);
      }
      setScanResult(result);
      setFieldsDirty(true);
      setReceiptPreviewUrl(URL.createObjectURL(preparedFile));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Foto struk belum dapat dipindai.",
      );
    } finally {
      setScanning(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Nominal harus berupa angka bulat lebih dari nol.");
      return;
    }
    if (!categoryId) {
      setError("Pilih kategori terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        type,
        amount: numericAmount,
        category_id: categoryId,
        transaction_date: date,
      };
      if (transaction) {
        if (!online) {
          setError("Edit transaksi memerlukan koneksi internet.");
          return;
        }
        await updateTransaction(transaction.id, {
          ...input,
          version: transaction.version ?? 1,
          description: description.trim() || null,
        });
      } else {
        const result = await createOrQueueTransaction(actorUserId, {
          ...input,
          ...(description.trim() ? { description: description.trim() } : {}),
        });
        onSaved(result.status === "queued");
        return;
      }
      onSaved(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Transaksi belum dapat disimpan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop transaction-backdrop" onMouseDown={onClose}>
      <section
        className="transaction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="form-heading">
          <div>
            <p className="eyebrow">
              {transaction ? "Perbarui catatan" : "Catatan baru"}
            </p>
            <h2 id="transaction-form-title">
              {transaction ? "Edit transaksi" : "Tambah transaksi"}
            </h2>
          </div>
          <button
            className="dialog-close in-flow"
            type="button"
            onClick={onClose}
            aria-label="Tutup form"
          >
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          {!transaction && (
            <section
              className="receipt-scanner"
              aria-labelledby="receipt-scanner-title"
            >
              <div className="receipt-scanner-heading">
                <div>
                  <h3 id="receipt-scanner-title">Scan struk</h3>
                  <p>
                    {DEMO_MODE
                      ? "Tidak tersedia pada demo publik karena memakai Workers AI."
                      : "Isi draft pengeluaran dari foto, lalu periksa hasilnya."}
                  </p>
                </div>
                {!online && <small>Memerlukan koneksi internet.</small>}
              </div>
              <div className="receipt-scanner-actions">
                <label className="secondary-button receipt-file-button">
                  <span>{scanning ? "Memindai..." : "Ambil foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={DEMO_MODE || !online || scanning}
                    aria-label="Ambil foto struk dengan kamera"
                    onChange={(event) => {
                      void scanSelectedReceipt(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="secondary-button receipt-file-button">
                  <span>{scanning ? "Memindai..." : "Pilih dari galeri"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={DEMO_MODE || !online || scanning}
                    aria-label="Pilih foto struk dari galeri"
                    onChange={(event) => {
                      void scanSelectedReceipt(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {scanning && (
                <p className="receipt-scan-progress" role="status">
                  Menyiapkan dan membaca foto struk...
                </p>
              )}
              {scanResult && receiptPreviewUrl && (
                <aside className="receipt-review" aria-live="polite">
                  <img src={receiptPreviewUrl} alt="Pratinjau foto struk" />
                  <div>
                    <strong>Periksa kembali sebelum menyimpan.</strong>
                    <p>
                      Hasil scan tidak disimpan otomatis. Tingkat keyakinan:{" "}
                      <b>
                        {scanResult.confidence === "high"
                          ? "tinggi"
                          : scanResult.confidence === "medium"
                            ? "sedang"
                            : "rendah"}
                      </b>
                      .
                    </p>
                    {scanResult.warnings.length > 0 && (
                      <ul className="receipt-warnings">
                        {scanResult.warnings.map((warning, index) => (
                          <li key={`${index}-${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    {scanResult.warnings.length === 0 && (
                      <p className="receipt-warnings-empty">
                        Tidak ada peringatan tambahan dari hasil scan.
                      </p>
                    )}
                  </div>
                </aside>
              )}
            </section>
          )}
          <fieldset className="type-picker">
            <legend>Jenis transaksi</legend>
            <button
              type="button"
              aria-pressed={type === "expense"}
              onClick={() => changeType("expense")}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              aria-pressed={type === "income"}
              onClick={() => changeType("income")}
            >
              Pemasukan
            </button>
          </fieldset>
          <label className="amount-field">
            <span>Nominal</span>
            <div>
              <b>Rp</b>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
                onChange={(event) => {
                  setFieldsDirty(true);
                  setAmount(event.target.value.replace(/\D/g, ""));
                }}
                placeholder="0"
                required
              />
            </div>
          </label>
          <div className="form-grid">
            <label>
              <span>Kategori</span>
              <select
                value={categoryId}
                onChange={(event) => {
                  setFieldsDirty(true);
                  setCategoryId(event.target.value);
                }}
                required
              >
                <option value="">Pilih kategori</option>
                {availableCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tanggal</span>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setFieldsDirty(true);
                  setDate(event.target.value);
                }}
                required
              />
            </label>
          </div>
          <label>
            <span>
              Catatan <small>Opsional</small>
            </span>
            <textarea
              value={description}
              onChange={(event) => {
                setFieldsDirty(true);
                setDescription(event.target.value);
              }}
              maxLength={500}
              rows={3}
              placeholder="Makan siang, gaji bulan ini..."
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Batal
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Menyimpan..."
                : transaction
                  ? "Simpan perubahan"
                  : "Simpan transaksi"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmationDialog({
  title,
  message,
  dangerous,
  actionLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  dangerous?: boolean;
  actionLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      if (
        import.meta.env.VITE_DEMO_MODE === "true" &&
        cause instanceof TypeError
      ) {
        onClose();
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Perubahan belum dapat disimpan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop confirm-backdrop" onMouseDown={onClose}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={dangerous ? "danger" : ""}>
          {dangerous ? "!" : "↺"}
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Batal
          </button>
          <button
            className={dangerous ? "danger-button" : "primary-button"}
            type="button"
            disabled={submitting}
            onClick={() => void confirm()}
          >
            {submitting ? "Memproses..." : actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function TransactionsPage({
  userId,
  initialCategories,
  partnerId,
  viewMode,
  hidden,
  intent,
  onIntentHandled,
  openTrash,
  onTrashHandled,
  online,
}: {
  userId: string;
  initialCategories: Category[];
  partnerId?: string;
  viewMode: ViewMode;
  hidden: boolean;
  intent: TransactionType | null;
  onIntentHandled: () => void;
  openTrash: boolean;
  onTrashHandled: () => void;
  online: boolean;
}) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState("");
  const [owner, setOwner] = useState(() => (viewMode === "solo" ? userId : ""));
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formType, setFormType] = useState<TransactionType | null>(intent);
  const [reload, setReload] = useState(0);
  useAutoRefresh(() => setReload((value) => value + 1), 10_000, online);
  const [saved, setSaved] = useState<string | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [outboxItems, setOutboxItems] = useState<TransactionOutboxItem[]>([]);
  const [view, setView] = useState<"active" | "trashed">("active");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: "delete" | "restore" | "purge";
    transaction: Transaction;
  } | null>(null);

  useEffect(() => {
    if (intent) setFormType(intent);
  }, [intent]);

  useEffect(() => {
    if (viewMode === "solo" && owner !== userId) {
      setOwner(userId);
      setOffset(0);
    }
  }, [viewMode, userId, owner]);

  useEffect(() => {
    if (!openTrash) return;
    setView("trashed");
    setOffset(0);
    onTrashHandled();
  }, [openTrash, onTrashHandled]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const resource = `transactions:${view}:${type}:${owner}:${category}:${offset}`;
    loadWithSnapshot(userId, resource, async () => {
      const [transactions, categoryItems] = await Promise.all([
        view === "active"
          ? getTransactions(
              { type, owner, category, offset },
              controller.signal,
            )
          : getTrashedTransactions({ owner, offset }, controller.signal),
        getCategories(controller.signal),
      ]);
      return { transactions, categoryItems };
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.data.transactions.items);
        setTotal(result.data.transactions.total);
        setCategories(result.data.categoryItems);
        setSnapshotAt(result.syncedAt);
        setStale(result.stale);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.VITE_DEMO_MODE === "true") {
          void import("./demo").then(({ demoDashboard }) => {
            let demoItems = view === "active" ? demoDashboard.transactions : [];
            if (type)
              demoItems = demoItems.filter((item) => item.type === type);
            if (owner)
              demoItems = demoItems.filter(
                (item) => item.ownerUserId === owner,
              );
            setItems(demoItems);
            setTotal(demoItems.length);
            setCategories(demoCategories);
          });
          return;
        }
        setStale(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Riwayat belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, type, owner, category, offset, reload, view]);

  useEffect(() => {
    if (DEMO_MODE) return;
    let active = true;
    const refreshOutbox = () => {
      void getOutboxItems()
        .then((records) => {
          if (active)
            setOutboxItems(
              records.filter((item) => item.actorUserId === userId),
            );
        })
        .catch(() => {
          if (active) setOutboxItems([]);
        });
    };
    refreshOutbox();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshOutbox);
    window.addEventListener(TRANSACTION_SYNCED_EVENT, refreshOutbox);
    return () => {
      active = false;
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshOutbox);
      window.removeEventListener(TRANSACTION_SYNCED_EVENT, refreshOutbox);
    };
  }, [userId]);

  function closeForm() {
    setFormType(null);
    setEditing(null);
    onIntentHandled();
  }

  function savedTransaction(queued: boolean) {
    closeForm();
    setSaved(
      queued
        ? "Transaksi disimpan di perangkat dan akan disinkronkan otomatis."
        : "Perubahan transaksi berhasil disimpan.",
    );
    setReload((value) => value + 1);
    window.setTimeout(() => setSaved(null), 4000);
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setOffset(0);
  }

  function changeView(next: "active" | "trashed") {
    setView(next);
    setOffset(0);
    setSelected(null);
  }

  async function applyConfirmed() {
    if (!confirmation) return;
    if (!online || stale)
      throw new Error("Perubahan ini memerlukan koneksi internet.");
    const { kind, transaction } = confirmation;
    if (kind === "delete") await deleteTransaction(transaction.id);
    if (kind === "restore") await restoreTransaction(transaction.id);
    if (kind === "purge") await purgeTransaction(transaction.id);
    setConfirmation(null);
    setSelected(null);
    setSaved("Perubahan transaksi berhasil disimpan.");
    setReload((value) => value + 1);
    window.setTimeout(() => setSaved(null), 3000);
  }

  return (
    <section className="transactions-page" aria-labelledby="transactions-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Catatan keuangan</p>
          <h1 id="transactions-title">Transaksi</h1>
          <p>Semua yang masuk dan keluar, tersusun dalam satu cerita.</p>
        </div>
        <div className="page-actions transaction-page-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => changeView(view === "active" ? "trashed" : "active")}
          >
            {view === "active" ? "Trash" : "Kembali"}
          </button>
          {view === "active" && (
            <button
              className="quick-add"
              type="button"
              onClick={() => setFormType("expense")}
            >
              + Catat transaksi
            </button>
          )}
        </div>
      </div>
      {saved && (
        <div className="success-banner" role="status">
          {saved}
        </div>
      )}
      {stale && snapshotAt && (
        <div className="stale-note" role="status">
          Data terakhir disinkronkan{" "}
          {new Date(snapshotAt).toLocaleString("id-ID")}.
        </div>
      )}
      {outboxItems.length > 0 && (
        <section className="outbox-panel" aria-labelledby="outbox-title">
          <div>
            <p className="eyebrow">Tersimpan di perangkat</p>
            <h2 id="outbox-title">Menunggu sinkronisasi</h2>
          </div>
          <ul>
            {outboxItems.map((item) => (
              <li key={item.idempotencyKey}>
                <span>
                  <b>{item.input.description || "Transaksi tanpa catatan"}</b>
                  <small>
                    {item.input.transaction_date} · {item.attempts} percobaan
                  </small>
                </span>
                <strong>{displayMoney(item.input.amount, hidden)}</strong>
                <em className={item.status}>
                  {item.status === "failed" ? "Perlu diperiksa" : "Menunggu"}
                </em>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="transaction-view-heading">
        <div>
          <button
            type="button"
            aria-pressed={view === "active"}
            onClick={() => changeView("active")}
          >
            Aktif
          </button>
          <button
            type="button"
            aria-pressed={view === "trashed"}
            onClick={() => changeView("trashed")}
          >
            Trash
          </button>
        </div>
        {view === "trashed" && (
          <p>Catatan dihapus permanen otomatis setelah 30 hari.</p>
        )}
      </div>
      <div
        className={`filter-bar ${view === "trashed" ? "trash-filters" : ""}`}
      >
        {view === "active" && (
          <>
            <label>
              <span>Jenis</span>
              <select
                value={type}
                onChange={(event) => changeFilter(setType, event.target.value)}
              >
                <option value="">Semua</option>
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
                <option value="saving_deposit">Setoran tabungan</option>
                <option value="saving_withdrawal">Penarikan tabungan</option>
                <option value="saving_transfer">Transfer tabungan</option>
              </select>
            </label>
          </>
        )}
        <label>
          <span>Pemilik</span>
          {viewMode === "solo" ? (
            <select value={userId} disabled>
              <option value={userId}>Milikmu</option>
            </select>
          ) : (
            <select
              value={owner}
              onChange={(event) => changeFilter(setOwner, event.target.value)}
            >
              <option value="">Semua</option>
              <option value={userId}>Milikmu</option>
              {partnerId && <option value={partnerId}>Pasangan</option>}
            </select>
          )}
        </label>
        {view === "active" && (
          <label>
            <span>Kategori</span>
            <select
              value={category}
              onChange={(event) =>
                changeFilter(setCategory, event.target.value)
              }
            >
              <option value="">Semua kategori</option>
              {categories
                .filter((item) => !type || item.type === type)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className="transaction-ledger">
        <div className="ledger-heading">
          <span>
            {total} {view === "trashed" ? "di Trash" : "catatan"}
          </span>
          <span>Nominal</span>
        </div>
        {loading && items.length === 0 ? (
          <div className="ledger-loading">
            <i />
            <i />
            <i />
          </div>
        ) : error && items.length === 0 ? (
          <div className="empty-state">
            <span>Riwayat belum tersambung</span>
            <p>{error}</p>
            <button
              className="text-button"
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Coba lagi
            </button>
          </div>
        ) : items.length ? (
          <ul>
            {items.map((item) => {
              const mine = item.ownerUserId === userId;
              const saving = item.type.startsWith("saving_");
              const mutable = mine && !saving && online && !stale;
              const tone = saving ? "saving" : item.type;
              return (
                <li key={item.id}>
                  <span className={`ledger-icon ${tone}`}>
                    {saving ? "◎" : item.type === "income" ? "↙" : "↗"}
                  </span>
                  <span className="ledger-copy">
                    <b>
                      {item.description ||
                        item.category?.name ||
                        "Mutasi tabungan"}
                    </b>
                    <small>
                      {mine ? "Milikmu" : "Milik pasangan"} ·{" "}
                      {shortDate.format(
                        new Date(`${item.transactionDate}T12:00:00`),
                      )}
                    </small>
                    {item.category && <em>{item.category.name}</em>}
                  </span>
                  <strong
                    className={
                      saving
                        ? ""
                        : item.type === "income"
                          ? "positive"
                          : "negative"
                    }
                  >
                    {saving ? "" : item.type === "income" ? "+" : "−"}
                    {displayMoney(item.amount, hidden)}
                  </strong>
                  {view === "active" ? (
                    <button
                      type="button"
                      aria-label={
                        mutable
                          ? "Buka opsi transaksi"
                          : saving
                            ? "Mutasi dikelola dari halaman tabungan"
                            : "Transaksi pasangan hanya dapat dilihat"
                      }
                      disabled={!mutable}
                      onClick={() => setSelected(item)}
                    >
                      •••
                    </button>
                  ) : (
                    <div className="trash-actions">
                      <button
                        type="button"
                        disabled={!mutable}
                        onClick={() =>
                          setConfirmation({
                            kind: "restore",
                            transaction: item,
                          })
                        }
                      >
                        Pulihkan
                      </button>
                      <button
                        className="danger-text"
                        type="button"
                        disabled={!mutable}
                        onClick={() =>
                          setConfirmation({ kind: "purge", transaction: item })
                        }
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <span>Belum ada catatan</span>
            <p>
              {view === "trashed"
                ? "Catatan yang dihapus akan muncul di sini."
                : "Coba ubah filter atau catat transaksi pertama."}
            </p>
          </div>
        )}
        <div className="pagination">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 10))}
          >
            Sebelumnya
          </button>
          <span>Halaman {Math.floor(offset / 10) + 1}</span>
          <button
            type="button"
            disabled={offset + 10 >= total}
            onClick={() => setOffset(offset + 10)}
          >
            Berikutnya
          </button>
        </div>
      </div>
      {(formType || editing) && (
        <TransactionForm
          initialType={
            formType ?? (editing?.type === "income" ? "income" : "expense")
          }
          transaction={editing ?? undefined}
          categories={categories}
          actorUserId={userId}
          online={online && !stale}
          onClose={closeForm}
          onSaved={savedTransaction}
        />
      )}
      {selected && (
        <div
          className="dialog-backdrop action-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="transaction-actions"
            role="dialog"
            aria-modal="true"
            aria-label="Opsi transaksi"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Kelola catatan</p>
            <h2>
              {selected.description || selected.category?.name || "Transaksi"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setEditing(selected);
                setSelected(null);
              }}
            >
              Edit transaksi
            </button>
            <button
              className="danger-text"
              type="button"
              onClick={() => {
                setConfirmation({ kind: "delete", transaction: selected });
                setSelected(null);
              }}
            >
              Pindahkan ke Trash
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelected(null)}
            >
              Batal
            </button>
          </section>
        </div>
      )}
      {confirmation && (
        <ConfirmationDialog
          title={
            confirmation.kind === "delete"
              ? "Pindahkan ke Trash?"
              : confirmation.kind === "restore"
                ? "Pulihkan transaksi?"
                : "Hapus permanen?"
          }
          message={
            confirmation.kind === "delete"
              ? "Catatan dapat dipulihkan dari Trash selama 30 hari."
              : confirmation.kind === "restore"
                ? "Catatan akan kembali ke riwayat aktif dan masuk ke perhitungan saldo."
                : "Tindakan ini tidak dapat dibatalkan dan catatan tidak bisa dipulihkan lagi."
          }
          dangerous={confirmation.kind !== "restore"}
          actionLabel={
            confirmation.kind === "delete"
              ? "Pindahkan"
              : confirmation.kind === "restore"
                ? "Pulihkan"
                : "Hapus permanen"
          }
          onClose={() => setConfirmation(null)}
          onConfirm={applyConfirmed}
        />
      )}
    </section>
  );
}
