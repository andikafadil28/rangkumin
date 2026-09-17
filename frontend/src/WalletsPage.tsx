import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  archiveWallet,
  createWalletAllocation,
  createWallet,
  deleteWallet,
  getTransactions,
  getWalletAllocations,
  getWallets,
  setDefaultWallet,
  transferBetweenWallets,
  unarchiveWallet,
  updateWallet,
} from "./api";
import type {
  ReconciliationStatus,
  Transaction,
  Wallet,
  WalletAllocation,
  WalletAllocationDirection,
  WalletOverview,
  WalletType,
} from "./api";
import { loadWithSnapshot } from "./offline/snapshots";
import { useAutoRefresh } from "./useAutoRefresh";
import type { ViewMode } from "./viewMode";

type Operation =
  { kind: "create" } | { kind: "edit"; wallet: Wallet } | { kind: "transfer" };

type Confirmation = {
  kind: "archive" | "unarchive" | "delete";
  wallet: Wallet;
};

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const groupLabels: Record<string, string> = {
  cash: "Tunai",
  bank: "Bank",
  e_wallet: "E-Wallet",
  other: "Lainnya",
};

const typeLabels: Record<WalletType, string> = {
  cash: "Cash",
  bank: "Bank",
  e_wallet: "E-Wallet",
  other: "Lainnya",
};

const typeMarks: Record<WalletType, string> = {
  cash: "Rp",
  bank: "B",
  e_wallet: "E",
  other: "D",
};

export const reconciliationLabels: Record<ReconciliationStatus, string> = {
  unreconciled: "Belum dicocokkan",
  reconciled: "Sudah cocok",
  excluded: "Dikecualikan",
};

export function walletTransactionAmount(
  transaction: Transaction,
  walletId: string,
): number {
  if (transaction.type === "income" && transaction.walletId === walletId)
    return transaction.amount;
  if (transaction.type === "expense" && transaction.walletId === walletId)
    return -transaction.amount;
  if (
    transaction.type === "saving_deposit" &&
    transaction.walletId === walletId
  )
    return -transaction.amount;
  if (
    transaction.type === "saving_withdrawal" &&
    transaction.walletId === walletId
  )
    return transaction.amount;
  if (transaction.type === "wallet_transfer") {
    if (transaction.sourceWallet?.id === walletId) return -transaction.amount;
    if (transaction.destinationWallet?.id === walletId)
      return transaction.amount;
  }
  return 0;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayMoney(value: number, hidden: boolean) {
  return hidden ? "Rp ••••••" : money.format(value);
}

const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function filterWallets(
  wallets: Wallet[],
  userId: string,
  viewMode: ViewMode,
  archived: boolean,
) {
  return wallets.filter(
    (wallet) =>
      wallet.isArchived === archived &&
      (viewMode === "couple" || wallet.ownerUserId === userId),
  );
}

export function groupWallets(wallets: Wallet[]) {
  const groups = new Map<
    string,
    { ownerUserId: string; name: string; label: string; wallets: Wallet[] }
  >();
  for (const wallet of wallets) {
    const key = `${wallet.ownerUserId}:${wallet.groupName}`;
    const group = groups.get(key) ?? {
      ownerUserId: wallet.ownerUserId,
      name: wallet.groupName,
      label: groupLabels[wallet.groupName] ?? wallet.groupName,
      wallets: [],
    };
    group.wallets.push(wallet);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function getAllocationMaximum(
  direction: WalletAllocationDirection,
  overview: WalletOverview,
  wallet?: Wallet,
) {
  return direction === "to_wallet"
    ? overview.unallocatedBalance
    : Math.max(0, wallet?.balance ?? 0);
}

function WalletForm({
  operation,
  wallets,
  onClose,
  onSaved,
  availableBalance,
}: {
  operation: Operation;
  wallets: Wallet[];
  onClose: () => void;
  onSaved: () => void;
  availableBalance?: number;
}) {
  const editing = operation.kind === "edit" ? operation.wallet : null;
  const [type, setType] = useState<WalletType>(editing?.type ?? "cash");
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "");
  const [color, setColor] = useState(editing?.color ?? "#597367");
  const [groupName, setGroupName] = useState(editing?.groupName ?? "cash");
  const [initialBalance, setInitialBalance] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [sourceId, setSourceId] = useState(
    wallets.find((wallet) => wallet.defaultWallet)?.id ?? wallets[0]?.id ?? "",
  );
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [transferNote, setTransferNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title =
    operation.kind === "create"
      ? "Buat dompet"
      : operation.kind === "edit"
        ? `Kelola ${operation.wallet.name}`
        : "Transfer antar dompet";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (operation.kind === "transfer") {
        const numericAmount = Number(amount);
        if (!sourceId || !destinationId || sourceId === destinationId) {
          throw new Error("Pilih dua dompet yang berbeda.");
        }
        if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
          throw new Error("Nominal harus berupa angka bulat lebih dari nol.");
        }
        const source = wallets.find((wallet) => wallet.id === sourceId);
        if (source && source.balance < numericAmount) {
          throw new Error("Saldo dompet asal tidak mencukupi.");
        }
        await transferBetweenWallets({
          source_wallet_id: sourceId,
          destination_wallet_id: destinationId,
          amount: numericAmount,
          transaction_date: date,
          ...(transferNote.trim() ? { description: transferNote.trim() } : {}),
        });
      } else {
        const common = {
          type,
          name: name.trim(),
          description: description.trim() || null,
          icon: icon.trim() || null,
          color,
          group_name: groupName,
        };
        if (operation.kind === "create") {
          const numericBalance = initialBalance ? Number(initialBalance) : 0;
          if (!Number.isSafeInteger(numericBalance) || numericBalance < 0) {
            throw new Error("Saldo awal harus berupa angka bulat non-negatif.");
          }
          if (
            availableBalance !== undefined &&
            numericBalance > availableBalance
          ) {
            throw new Error("Saldo Tanpa dompet tidak mencukupi.");
          }
          await createWallet({
            ...common,
            initial_balance: numericBalance,
            default_wallet: makeDefault,
          });
        } else {
          await updateWallet(operation.wallet.id, common);
        }
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Dompet belum dapat disimpan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop wallet-backdrop" onMouseDown={onClose}>
      <section
        className="wallet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="form-heading">
          <div>
            <p className="eyebrow">Dompet</p>
            <h2 id="wallet-form-title">{title}</h2>
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
          {operation.kind === "transfer" ? (
            <>
              <div className="form-grid">
                <label>
                  <span>Dari dompet</span>
                  <select
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                    required
                  >
                    <option value="">Pilih sumber</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name} · {money.format(wallet.balance)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Ke dompet</span>
                  <select
                    value={destinationId}
                    onChange={(event) => setDestinationId(event.target.value)}
                    required
                  >
                    <option value="">Pilih tujuan</option>
                    {wallets
                      .filter((wallet) => wallet.id !== sourceId)
                      .map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="amount-field">
                <span>Nominal</span>
                <div>
                  <b>Rp</b>
                  <input
                    autoFocus
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={amount}
                    onChange={(event) =>
                      setAmount(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="0"
                    required
                  />
                </div>
              </label>
              <label>
                <span>Tanggal</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Catatan <small>Opsional</small>
                </span>
                <textarea
                  value={transferNote}
                  onChange={(event) => setTransferNote(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Pindah dana untuk..."
                />
              </label>
            </>
          ) : (
            <>
              <div className="form-grid">
                <label>
                  <span>Jenis</span>
                  <select
                    value={type}
                    onChange={(event) => {
                      const next = event.target.value as WalletType;
                      if (groupName === type) setGroupName(next);
                      setType(next);
                    }}
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Grup</span>
                  <select
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  >
                    {Object.entries(groupLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Nama dompet</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="Rekening harian"
                  required
                />
              </label>
              <div className="form-grid wallet-visual-fields">
                <label>
                  <span>
                    Ikon <small>Opsional</small>
                  </span>
                  <input
                    value={icon}
                    onChange={(event) => setIcon(event.target.value)}
                    maxLength={50}
                    placeholder={typeMarks[type]}
                  />
                </label>
                <label>
                  <span>Warna</span>
                  <input
                    className="wallet-color-input"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                </label>
              </div>
              {operation.kind === "create" && (
                <>
                  <label className="amount-field">
                    <span>
                      Alokasi awal dari Tanpa dompet <small>Opsional</small>
                    </span>
                    <div>
                      <b>Rp</b>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={initialBalance}
                        onChange={(event) =>
                          setInitialBalance(
                            event.target.value.replace(/\D/g, ""),
                          )
                        }
                        placeholder="0"
                      />
                    </div>
                  </label>
                  {availableBalance !== undefined && (
                    <p className="wallet-balance-hint">
                      Tersedia {money.format(availableBalance)}. Alokasi hanya
                      memindahkan pencatatan saldo, bukan menambah total uang.
                    </p>
                  )}
                  <label className="wallet-check">
                    <input
                      type="checkbox"
                      checked={makeDefault}
                      onChange={(event) => setMakeDefault(event.target.checked)}
                    />
                    <span>Jadikan dompet utama</span>
                  </label>
                </>
              )}
              <label>
                <span>
                  Catatan <small>Opsional</small>
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Kegunaan dompet ini..."
                />
              </label>
            </>
          )}
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
                : operation.kind === "transfer"
                  ? "Transfer"
                  : "Simpan"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WalletAllocationDialog({
  wallets,
  overview,
  initialWalletId,
  onClose,
  onSaved,
}: {
  wallets: Wallet[];
  overview: WalletOverview;
  initialWalletId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [walletId, setWalletId] = useState(
    initialWalletId ?? wallets[0]?.id ?? "",
  );
  const [direction, setDirection] =
    useState<WalletAllocationDirection>("to_wallet");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const wallet = wallets.find((item) => item.id === walletId);
  const maximum = getAllocationMaximum(direction, overview, wallet);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const numericAmount = Number(amount);
    if (!walletId) {
      setError("Pilih dompet yang akan diatur.");
      return;
    }
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Nominal harus berupa angka bulat lebih dari nol.");
      return;
    }
    if (numericAmount > maximum) {
      setError(
        direction === "to_wallet"
          ? "Saldo Tanpa dompet tidak mencukupi."
          : "Saldo dompet tidak mencukupi.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await createWalletAllocation({
        wallet_id: walletId,
        direction,
        amount: numericAmount,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Saldo belum dapat diatur.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop wallet-backdrop" onMouseDown={onClose}>
      <section
        className="wallet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-allocation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="form-heading">
          <div>
            <p className="eyebrow">Alokasi saldo</p>
            <h2 id="wallet-allocation-title">Atur saldo</h2>
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
          <p className="wallet-allocation-copy">
            Pindahkan pencatatan antara Tanpa dompet dan dompet. Total Saldo
            tersedia tidak berubah dan uang tidak dihitung dua kali.
          </p>
          <fieldset className="type-picker">
            <legend>Arah alokasi</legend>
            <button
              type="button"
              aria-pressed={direction === "to_wallet"}
              onClick={() => setDirection("to_wallet")}
            >
              Ke dompet
            </button>
            <button
              type="button"
              aria-pressed={direction === "to_unallocated"}
              onClick={() => setDirection("to_unallocated")}
            >
              Ke Tanpa dompet
            </button>
          </fieldset>
          <label>
            <span>Dompet</span>
            <select
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
              required
            >
              <option value="">Pilih dompet</option>
              {wallets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {money.format(item.balance)}
                </option>
              ))}
            </select>
          </label>
          <label className="amount-field">
            <span>Nominal</span>
            <div>
              <b>Rp</b>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/\D/g, ""))
                }
                placeholder="0"
                required
              />
            </div>
          </label>
          <p className="wallet-balance-hint">
            Maksimal {money.format(maximum)} dari{" "}
            {direction === "to_wallet" ? "Tanpa dompet" : wallet?.name}.
          </p>
          <label>
            <span>
              Catatan <small>Opsional</small>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Penyesuaian saldo..."
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
              {submitting ? "Menyimpan..." : "Atur saldo"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WalletDetailDialog({
  wallet,
  userId,
  hidden,
  onClose,
  onQuickAdd,
}: {
  wallet: Wallet;
  userId: string;
  hidden: boolean;
  onClose: () => void;
  onQuickAdd: (wallet: Wallet) => void;
}) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<WalletAllocation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [reconciliation, setReconciliation] = useState<
    "all" | ReconciliationStatus
  >("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTransactions(
      {
        wallet: wallet.id,
        reconciliationStatus:
          reconciliation === "all" ? undefined : reconciliation,
        offset,
        sort: "date_desc",
      },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Mutasi dompet belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [wallet.id, reconciliation, offset]);

  useEffect(() => {
    const controller = new AbortController();
    getWalletAllocations(wallet.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAllocations(result.allocations);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAllocations([]);
      });
    return () => controller.abort();
  }, [wallet.id]);

  function changeReconciliation(next: "all" | ReconciliationStatus) {
    setReconciliation(next);
    setOffset(0);
  }

  return (
    <div className="dialog-backdrop action-backdrop" onMouseDown={onClose}>
      <section
        className="wallet-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="wallet-detail-heading">
          <div>
            <p className="eyebrow">Mutasi dompet</p>
            <h2 id="wallet-detail-title">{wallet.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup detail">
            ×
          </button>
        </div>
        <div
          className="wallet-detail-hero"
          style={
            {
              "--wallet-color": wallet.color ?? "var(--forest)",
            } as React.CSSProperties
          }
        >
          <span className="wallet-mark" aria-hidden="true">
            {wallet.icon || typeMarks[wallet.type]}
          </span>
          <div>
            <small>
              {typeLabels[wallet.type]}
              {wallet.groupName !== wallet.type
                ? ` · ${groupLabels[wallet.groupName] ?? wallet.groupName}`
                : ""}
            </small>
            <b>{displayMoney(wallet.balance, hidden)}</b>
          </div>
          <div className="wallet-badges">
            {wallet.defaultWallet && (
              <span className="default-badge">Utama</span>
            )}
            <span className="scope-badge">
              {wallet.ownerUserId === userId ? "Milikmu" : "Pasangan"}
            </span>
            {wallet.isArchived && <span className="readonly-badge">Arsip</span>}
          </div>
        </div>
        {wallet.description && (
          <p className="wallet-detail-note">{wallet.description}</p>
        )}
        <div className="wallet-detail-actions">
          <button
            className="quick-add"
            type="button"
            disabled={wallet.isArchived}
            onClick={() => onQuickAdd(wallet)}
          >
            + Catat transaksi
          </button>
        </div>
        <div
          className="wallet-recon-filter"
          role="group"
          aria-label="Filter status rekonsiliasi"
        >
          {(["all", "unreconciled", "reconciled", "excluded"] as const).map(
            (value) => (
              <button
                key={value}
                type="button"
                aria-pressed={reconciliation === value}
                onClick={() => changeReconciliation(value)}
              >
                {value === "all" ? "Semua" : reconciliationLabels[value]}
              </button>
            ),
          )}
        </div>
        {loading && items.length === 0 ? (
          <div className="wallet-mutations-loading">
            <i />
            <i />
            <i />
          </div>
        ) : error && items.length === 0 ? (
          <div className="empty-state wallet-mutations-empty">
            <span>Mutasi belum tersambung</span>
            <p>{error}</p>
            <button
              className="text-button"
              type="button"
              onClick={() => setOffset(0)}
            >
              Coba lagi
            </button>
          </div>
        ) : items.length ? (
          <ul className="wallet-mutations">
            {items.map((transaction) => {
              const amount = walletTransactionAmount(transaction, wallet.id);
              const phrasing =
                transaction.type === "wallet_transfer"
                  ? transaction.sourceWallet?.id === wallet.id
                    ? `Pindah ke ${transaction.destinationWallet?.name ?? "dompet lain"}`
                    : `Dari ${transaction.sourceWallet?.name ?? "dompet lain"}`
                  : null;
              return (
                <li key={transaction.id}>
                  <span
                    className={`wallet-mutation-mark ${amount >= 0 ? "positive" : "negative"}`}
                  >
                    {amount >= 0 ? "↙" : "↗"}
                  </span>
                  <span className="wallet-mutation-copy">
                    <b>
                      {phrasing ??
                        transaction.description ??
                        transaction.category?.name ??
                        "Transaksi"}
                    </b>
                    <small>
                      {transaction.ownerUserId === userId ? "Kamu" : "Pasangan"}{" "}
                      ·{" "}
                      {shortDate.format(
                        new Date(`${transaction.transactionDate}T12:00:00`),
                      )}{" "}
                      · {reconciliationLabels[transaction.reconciliationStatus]}
                    </small>
                  </span>
                  <strong className={amount >= 0 ? "positive" : "negative"}>
                    {amount >= 0 ? "+" : "−"}
                    {displayMoney(Math.abs(amount), hidden)}
                  </strong>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state wallet-mutations-empty">
            <span>
              {reconciliation === "all"
                ? "Belum ada mutasi"
                : `Tidak ada mutasi ${reconciliationLabels[reconciliation]}`}
            </span>
            <p>
              {reconciliation === "all"
                ? "Transaksi di dompet ini akan muncul di sini."
                : "Coba pilih status lain atau catat transaksi baru."}
            </p>
          </div>
        )}
        {total > items.length && (
          <div className="pagination wallet-mutations-pagination">
            <button type="button" onClick={() => setOffset(offset + 10)}>
              Muat lebih ({items.length}/{total})
            </button>
          </div>
        )}
        <section className="wallet-allocation-history">
          <h3>Riwayat alokasi saldo</h3>
          <p>Perpindahan pencatatan antara dompet ini dan Tanpa dompet.</p>
          {allocations.length ? (
            <ul className="wallet-mutations">
              {allocations.map((allocation) => {
                const incoming = allocation.direction === "to_wallet";
                return (
                  <li key={allocation.id}>
                    <span
                      className={`wallet-mutation-mark ${incoming ? "positive" : "negative"}`}
                    >
                      {incoming ? "↙" : "↗"}
                    </span>
                    <span className="wallet-mutation-copy">
                      <b>
                        {allocation.description ||
                          (incoming ? "Dari Tanpa dompet" : "Ke Tanpa dompet")}
                      </b>
                      <small>
                        {shortDate.format(new Date(allocation.createdAt))}
                      </small>
                    </span>
                    <strong className={incoming ? "positive" : "negative"}>
                      {incoming ? "+" : "−"}
                      {displayMoney(allocation.amount, hidden)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="wallet-allocation-empty">Belum ada alokasi saldo.</p>
          )}
        </section>
        <button
          className="secondary-button wallet-detail-close"
          type="button"
          onClick={onClose}
        >
          Tutup
        </button>
      </section>
    </div>
  );
}

function WalletConfirmation({
  confirmation,
  onClose,
  onConfirmed,
}: {
  confirmation: Confirmation;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionLabel =
    confirmation.kind === "archive"
      ? "Arsipkan"
      : confirmation.kind === "unarchive"
        ? "Aktifkan"
        : "Hapus permanen";

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      if (confirmation.kind === "archive") {
        await archiveWallet(confirmation.wallet.id);
      } else if (confirmation.kind === "unarchive") {
        await unarchiveWallet(confirmation.wallet.id);
      } else {
        await deleteWallet(confirmation.wallet.id);
      }
      onConfirmed();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Status dompet belum dapat diubah.",
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
        aria-labelledby="wallet-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span
          className={
            confirmation.kind === "delete" ? "danger" : "wallet-confirm-mark"
          }
        >
          !
        </span>
        <h2 id="wallet-confirm-title">
          {actionLabel} {confirmation.wallet.name}?
        </h2>
        <p>
          {confirmation.kind === "archive"
            ? "Dompet disembunyikan dari daftar aktif. Saldo dan riwayatnya tetap tersimpan."
            : confirmation.kind === "unarchive"
              ? "Dompet akan kembali tersedia untuk transaksi dan transfer."
              : "Dompet hanya dapat dihapus jika saldonya nol dan belum memiliki riwayat transaksi."}
        </p>
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
            className={
              confirmation.kind === "delete"
                ? "danger-button"
                : "primary-button"
            }
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

export function WalletsPage({
  userId,
  viewMode,
  hidden,
  online,
  onQuickAdd,
}: {
  userId: string;
  viewMode: ViewMode;
  hidden: boolean;
  online: boolean;
  onQuickAdd: (wallet: Wallet) => void;
}) {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [overviews, setOverviews] = useState<WalletOverview[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [detail, setDetail] = useState<Wallet | null>(null);
  const [allocationWalletId, setAllocationWalletId] = useState<
    string | null | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyWalletId, setBusyWalletId] = useState<string | null>(null);

  useAutoRefresh(() => setReload((value) => value + 1), 10_000, online);

  useEffect(() => {
    if (online && !stale) return;
    setOperation(null);
    setConfirmation(null);
    setAllocationWalletId(undefined);
  }, [online, stale]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadWithSnapshot(userId, "wallets", () =>
      getWallets({ includeArchived: true }, controller.signal),
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setWallets(result.data.wallets);
        // Snapshot lama dapat belum memiliki overview; hindari crash saat offline.
        setOverviews(result.data.overviews ?? []);
        setStale(result.stale);
        setSnapshotAt(result.syncedAt);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setStale(true);
        setError(
          cause instanceof Error ? cause.message : "Dompet belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, userId]);

  function savedWallet() {
    setOperation(null);
    setConfirmation(null);
    setActionError(null);
    setSaved(true);
    setReload((value) => value + 1);
    window.setTimeout(() => setSaved(false), 3000);
  }

  async function makePrimary(wallet: Wallet) {
    setBusyWalletId(wallet.id);
    setActionError(null);
    try {
      await setDefaultWallet(wallet.id);
      savedWallet();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Dompet utama belum dapat diubah.",
      );
    } finally {
      setBusyWalletId(null);
    }
  }

  const allWallets = wallets ?? [];
  const visible = filterWallets(
    allWallets,
    userId,
    viewMode,
    view === "archived",
  );
  const grouped = groupWallets(
    [...visible].sort((left, right) => {
      if (left.ownerUserId === userId && right.ownerUserId !== userId)
        return -1;
      if (left.ownerUserId !== userId && right.ownerUserId === userId) return 1;
      return left.sortOrder - right.sortOrder;
    }),
  );
  const ownActive = allWallets.filter(
    (wallet) => wallet.ownerUserId === userId && !wallet.isArchived,
  );
  const archivedCount = filterWallets(
    allWallets,
    userId,
    viewMode,
    true,
  ).length;
  const visibleOverviews = overviews.filter(
    (overview) => viewMode === "couple" || overview.ownerUserId === userId,
  );
  const ownOverview = overviews.find(
    (overview) => overview.ownerUserId === userId,
  );
  const total = visibleOverviews.reduce(
    (sum, overview) => sum + overview.cashBalance,
    0,
  );
  const walletTotal = visibleOverviews.reduce(
    (sum, overview) => sum + overview.walletBalance,
    0,
  );
  const unallocatedTotal = visibleOverviews.reduce(
    (sum, overview) => sum + overview.unallocatedBalance,
    0,
  );
  const mutable = online && !stale;

  return (
    <section className="wallets-page" aria-labelledby="wallets-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Di mana uangmu berada</p>
          <h1 id="wallets-page-title">Dompet</h1>
          <p>
            Pisahkan cash, rekening, dan e-wallet tanpa memisahkan ceritanya.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={!mutable || ownActive.length < 2 || view === "archived"}
            onClick={() => setOperation({ kind: "transfer" })}
          >
            Transfer
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setView((current) =>
                current === "active" ? "archived" : "active",
              )
            }
          >
            {view === "active" ? `Arsip (${archivedCount})` : "Kembali"}
          </button>
          {view === "active" && (
            <button
              className="quick-add"
              type="button"
              disabled={!mutable}
              onClick={() => setOperation({ kind: "create" })}
            >
              + Buat dompet
            </button>
          )}
        </div>
      </div>
      {saved && (
        <div className="success-banner" role="status">
          Perubahan dompet berhasil disimpan.
        </div>
      )}
      {actionError && (
        <div className="form-error wallet-page-error" role="alert">
          {actionError}
        </div>
      )}
      {stale && snapshotAt && (
        <div className="stale-note" role="status">
          Mode baca saja. Snapshot diperbarui{" "}
          {new Date(snapshotAt).toLocaleString("id-ID")}.
        </div>
      )}
      <section className="wallets-hero">
        <div>
          <p className="eyebrow light">Saldo tersedia</p>
          <span>Total {viewMode === "solo" ? "milikmu" : "kalian"}</span>
          <strong>{displayMoney(total, hidden)}</strong>
        </div>
        <div>
          <span>Dalam dompet</span>
          <b>{displayMoney(walletTotal, hidden)}</b>
          <small>
            {filterWallets(allWallets, userId, viewMode, false).length} dompet
            aktif
          </small>
        </div>
        <div>
          <span>Tanpa dompet</span>
          <b>{displayMoney(unallocatedTotal, hidden)}</b>
          <small>Belum dialokasikan ke dompet</small>
        </div>
      </section>
      {loading && !wallets ? (
        <div className="wallets-loading">
          <i />
          <i />
          <i />
        </div>
      ) : error && !wallets ? (
        <div className="empty-state">
          <span>Dompet belum tersambung</span>
          <p>{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Coba lagi
          </button>
        </div>
      ) : grouped.length || (view === "active" && visibleOverviews.length) ? (
        <div className="wallet-sections">
          {view === "active" &&
            visibleOverviews.map((overview) => {
              const owned = overview.ownerUserId === userId;
              return (
                <section
                  className="wallet-group"
                  key={`unallocated:${overview.ownerUserId}`}
                >
                  <div className="wallet-group-heading">
                    <div>
                      <span>{owned ? "Milikmu" : "Milik pasangan"}</span>
                      <h2>Belum dialokasikan</h2>
                    </div>
                    <small>Virtual</small>
                  </div>
                  <div className="wallet-grid">
                    <article className="wallet-card wallet-card-unallocated">
                      <div className="wallet-card-top">
                        <span className="wallet-mark" aria-hidden="true">
                          ∅
                        </span>
                        <span className="scope-badge">
                          {owned ? "Milikmu" : "Pasangan"}
                        </span>
                      </div>
                      <div className="wallet-card-copy">
                        <small>SALDO VIRTUAL</small>
                        <h3>Tanpa dompet</h3>
                        <p>
                          Saldo tersedia yang belum dicatat di cash, bank, atau
                          e-wallet tertentu.
                        </p>
                      </div>
                      <strong>
                        {displayMoney(overview.unallocatedBalance, hidden)}
                      </strong>
                      <div className="wallet-card-actions">
                        {owned ? (
                          <button
                            type="button"
                            disabled={!mutable || ownActive.length === 0}
                            onClick={() => setAllocationWalletId(null)}
                          >
                            Atur saldo
                          </button>
                        ) : (
                          <span className="readonly-badge">Hanya lihat</span>
                        )}
                      </div>
                    </article>
                  </div>
                </section>
              );
            })}
          {grouped.map((group) => (
            <section
              className="wallet-group"
              key={`${group.ownerUserId}:${group.name}`}
            >
              <div className="wallet-group-heading">
                <div>
                  <span>
                    {group.ownerUserId === userId
                      ? "Milikmu"
                      : "Milik pasangan"}
                  </span>
                  <h2>{group.label}</h2>
                </div>
                <small>{group.wallets.length} dompet</small>
              </div>
              <div className="wallet-grid">
                {group.wallets.map((wallet) => {
                  const owned = wallet.ownerUserId === userId;
                  const enabled = mutable && owned;
                  return (
                    <article
                      className={`wallet-card ${wallet.isArchived ? "is-archived" : ""}`}
                      key={wallet.id}
                      style={
                        {
                          "--wallet-color": wallet.color ?? "var(--forest)",
                        } as React.CSSProperties
                      }
                    >
                      <div className="wallet-card-top">
                        <span className="wallet-mark" aria-hidden="true">
                          {wallet.icon || typeMarks[wallet.type]}
                        </span>
                        <div className="wallet-badges">
                          {wallet.defaultWallet && (
                            <span className="default-badge">Utama</span>
                          )}
                          <span className="scope-badge">
                            {owned ? "Milikmu" : "Pasangan"}
                          </span>
                        </div>
                      </div>
                      <div className="wallet-card-copy">
                        <small>{typeLabels[wallet.type]}</small>
                        <h3>{wallet.name}</h3>
                        {wallet.description && <p>{wallet.description}</p>}
                      </div>
                      <strong>{displayMoney(wallet.balance, hidden)}</strong>
                      <div className="wallet-card-actions">
                        <button type="button" onClick={() => setDetail(wallet)}>
                          Lihat mutasi
                        </button>
                        {wallet.isArchived ? (
                          <>
                            <button
                              type="button"
                              disabled={!enabled}
                              onClick={() =>
                                setConfirmation({ kind: "unarchive", wallet })
                              }
                            >
                              Aktifkan
                            </button>
                            <button
                              className="danger-link"
                              type="button"
                              disabled={!enabled}
                              onClick={() =>
                                setConfirmation({ kind: "delete", wallet })
                              }
                            >
                              Hapus
                            </button>
                          </>
                        ) : owned ? (
                          <>
                            <button
                              type="button"
                              disabled={!enabled}
                              onClick={() =>
                                setOperation({ kind: "edit", wallet })
                              }
                            >
                              Kelola
                            </button>
                            <button
                              type="button"
                              disabled={!enabled}
                              onClick={() => setAllocationWalletId(wallet.id)}
                            >
                              Atur saldo
                            </button>
                            {!wallet.defaultWallet && (
                              <button
                                type="button"
                                disabled={
                                  !enabled || busyWalletId === wallet.id
                                }
                                onClick={() => void makePrimary(wallet)}
                              >
                                Jadikan utama
                              </button>
                            )}
                            <button
                              className="danger-link"
                              type="button"
                              disabled={!enabled || wallet.defaultWallet}
                              onClick={() =>
                                setConfirmation({ kind: "archive", wallet })
                              }
                            >
                              Arsipkan
                            </button>
                          </>
                        ) : (
                          <span className="readonly-badge">Hanya lihat</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state wallets-empty">
          <span>
            {view === "archived"
              ? "Belum ada dompet arsip"
              : "Belum ada dompet"}
          </span>
          <p>
            {view === "archived"
              ? "Dompet yang diarsipkan akan tersimpan di sini."
              : "Mulai dari cash, rekening utama, atau e-wallet yang paling sering dipakai."}
          </p>
          {view === "active" && (
            <button
              className="quick-add"
              type="button"
              disabled={!mutable}
              onClick={() => setOperation({ kind: "create" })}
            >
              Buat dompet pertama
            </button>
          )}
        </div>
      )}
      {operation && (
        <WalletForm
          operation={operation}
          wallets={ownActive}
          availableBalance={ownOverview?.unallocatedBalance}
          onClose={() => setOperation(null)}
          onSaved={savedWallet}
        />
      )}
      {allocationWalletId !== undefined && ownOverview && (
        <WalletAllocationDialog
          wallets={ownActive}
          overview={ownOverview}
          initialWalletId={allocationWalletId ?? undefined}
          onClose={() => setAllocationWalletId(undefined)}
          onSaved={() => {
            setAllocationWalletId(undefined);
            savedWallet();
          }}
        />
      )}
      {confirmation && (
        <WalletConfirmation
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
          onConfirmed={savedWallet}
        />
      )}
      {detail && (
        <WalletDetailDialog
          wallet={detail}
          userId={userId}
          hidden={hidden}
          onClose={() => setDetail(null)}
          onQuickAdd={onQuickAdd}
        />
      )}
    </section>
  );
}
