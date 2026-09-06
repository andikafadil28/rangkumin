import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAutoRefresh } from "./useAutoRefresh";
import {
  createBudget,
  createReminder,
  getCategories,
  getBudgets,
  getReminders,
  updateBudget,
  updateReminder,
} from "./api";
import type { Budget, Category, Reminder } from "./api";
import { loadWithSnapshot } from "./offline/snapshots";
import { partitionBudgets, partitionReminders } from "./viewMode";
import type { ViewMode } from "./viewMode";

type PlanForm = "budget" | "reminder";
type PlanFormState =
  | { type: "budget"; budget?: Budget }
  | { type: "reminder"; reminder?: Reminder };

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const demoBudgets: Budget[] = [
  {
    id: "budget-1",
    createdByUserId: "demo-user-1",
    ownershipScope: "shared",
    ownerUserId: null,
    category: { id: "cat-1", name: "Makanan & Minuman" },
    monthlyLimit: 3_000_000,
    spent: 1_860_000,
    remaining: 1_140_000,
    percentage: 62,
    startsOn: "2026-09-01",
    isActive: true,
    thresholds: [
      {
        id: "threshold-1",
        percentage: 80,
        notifyWeb: true,
        notifyTelegram: true,
      },
    ],
  },
  {
    id: "budget-2",
    createdByUserId: "demo-user-1",
    ownershipScope: "personal",
    ownerUserId: "demo-user-1",
    category: { id: "cat-2", name: "Hiburan" },
    monthlyLimit: 750_000,
    spent: 640_000,
    remaining: 110_000,
    percentage: 85.33,
    startsOn: "2026-09-01",
    isActive: true,
    thresholds: [
      {
        id: "threshold-2",
        percentage: 75,
        notifyWeb: true,
        notifyTelegram: false,
      },
    ],
  },
];
const demoReminders: Reminder[] = [
  {
    id: "reminder-1",
    creatorUserId: "demo-user-1",
    title: "Bayar internet rumah",
    description: "Sebelum jatuh tempo",
    amount: 425_000,
    categoryId: "cat-3",
    recurrenceType: "monthly",
    intervalValue: 10,
    nextRunAt: "2026-09-10T02:00:00.000Z",
    timezone: "Asia/Jakarta",
    isActive: true,
    notifyWeb: true,
    notifyTelegram: true,
    recipientUserIds: ["demo-user-1", "demo-user-2"],
  },
  {
    id: "reminder-2",
    creatorUserId: "demo-user-2",
    title: "Iuran lingkungan",
    description: null,
    amount: 100_000,
    categoryId: null,
    recurrenceType: "monthly",
    intervalValue: 15,
    nextRunAt: "2026-09-15T12:00:00.000Z",
    timezone: "Asia/Jakarta",
    isActive: true,
    notifyWeb: true,
    notifyTelegram: false,
    recipientUserIds: ["demo-user-1", "demo-user-2"],
  },
];

function nextLocalHour() {
  const now = new Date(Date.now() + 60 * 60 * 1000 + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 16);
}

function jakartaLocalInput(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function recurrenceLabel(reminder: Reminder) {
  if (reminder.recurrenceType === "once") return "Sekali";
  if (reminder.recurrenceType === "interval_days")
    return `Setiap ${reminder.intervalValue} hari`;
  if (reminder.recurrenceType === "weekly") return "Setiap minggu";
  return `Setiap tanggal ${reminder.intervalValue}`;
}

function PlanDialog({
  form,
  categories,
  userId,
  allUserIds,
  onClose,
  onSaved,
}: {
  form: PlanFormState;
  categories: Category[];
  userId: string;
  allUserIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const type = form.type;
  const budget = form.type === "budget" ? form.budget : undefined;
  const reminder = form.type === "reminder" ? form.reminder : undefined;
  const [scope, setScope] = useState<"personal" | "shared">(
    budget?.ownershipScope ?? "shared",
  );
  const [categoryId, setCategoryId] = useState(
    budget?.category.id ?? reminder?.categoryId ?? "",
  );
  const [amount, setAmount] = useState(
    String(budget?.monthlyLimit ?? reminder?.amount ?? ""),
  );
  const [threshold, setThreshold] = useState(
    String(budget?.thresholds[0]?.percentage ?? 80),
  );
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [description, setDescription] = useState(reminder?.description ?? "");
  const [recurrence, setRecurrence] = useState<Reminder["recurrenceType"]>(
    reminder?.recurrenceType ?? "monthly",
  );
  const [interval, setInterval] = useState(
    String(reminder?.intervalValue ?? 1),
  );
  const [runAt, setRunAt] = useState(() =>
    reminder ? jakartaLocalInput(reminder.nextRunAt) : nextLocalHour(),
  );
  const [recipient, setRecipient] = useState<"me" | "both" | "partner">(() => {
    if (!reminder || reminder.recipientUserIds.length > 1) return "both";
    return reminder.recipientUserIds[0] === userId ? "me" : "partner";
  });
  const [web, setWeb] = useState(
    budget?.thresholds[0]?.notifyWeb ?? reminder?.notifyWeb ?? true,
  );
  const [telegram, setTelegram] = useState(
    budget?.thresholds[0]?.notifyTelegram ?? reminder?.notifyTelegram ?? false,
  );
  const [active, setActive] = useState(
    budget?.isActive ?? reminder?.isActive ?? true,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const partnerId = allUserIds.find((id) => id !== userId);
  const defaultCategoriesOnly =
    (type === "budget" && scope === "shared") ||
    (type === "reminder" && recipient !== "me");
  const availableCategories = defaultCategoriesOnly
    ? categories.filter((category) => category.isDefault)
    : categories;

  useEffect(() => {
    if (
      categoryId &&
      !availableCategories.some((category) => category.id === categoryId)
    ) {
      setCategoryId("");
    }
  }, [categories, defaultCategoriesOnly, categoryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const numericAmount = Number(amount);
      if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0)
        throw new Error("Nominal harus berupa angka bulat lebih dari nol.");
      if (!web && !telegram)
        throw new Error("Pilih minimal satu kanal notifikasi.");
      if (type === "budget") {
        const numericThreshold = Number(threshold);
        if (!categoryId || numericThreshold < 1 || numericThreshold > 100)
          throw new Error("Lengkapi kategori dan ambang peringatan.");
        const thresholds = [
          {
            percentage: numericThreshold,
            notify_web: web,
            notify_telegram: telegram,
          },
        ];
        if (budget) {
          await updateBudget(budget.id, {
            monthly_limit: numericAmount,
            is_active: active,
            thresholds,
          });
        } else {
          const month = new Date(Date.now() + 7 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 7);
          await createBudget({
            ownership_scope: scope,
            category_id: categoryId,
            monthly_limit: numericAmount,
            starts_on: `${month}-01`,
            thresholds,
          });
        }
      } else {
        const recipients =
          recipient === "me"
            ? [userId]
            : recipient === "partner" && partnerId
              ? [partnerId]
              : partnerId
                ? [userId, partnerId]
                : [userId];
        const numericInterval =
          recurrence === "once" ? undefined : Number(interval);
        if (recurrence !== "once" && !Number.isInteger(numericInterval))
          throw new Error("Pola pengulangan belum lengkap.");
        const reminderInput = {
          title: title.trim(),
          description: description.trim() || null,
          amount: numericAmount,
          category_id: categoryId || null,
          recurrence_type: recurrence,
          interval_value: numericInterval ?? null,
          next_run_at: `${runAt}:00+07:00`,
          recipient_user_ids: recipients,
          notify_web: web,
          notify_telegram: telegram,
        };
        if (reminder)
          await updateReminder(reminder.id, {
            ...reminderInput,
            is_active: active,
          });
        else
          await createReminder({
            ...reminderInput,
            description: reminderInput.description ?? undefined,
            category_id: reminderInput.category_id ?? undefined,
            interval_value: numericInterval,
          });
      }
      onSaved();
    } catch (cause) {
      if (
        import.meta.env.VITE_DEMO_MODE === "true" &&
        cause instanceof TypeError
      ) {
        onSaved();
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Rencana belum dapat disimpan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop saving-backdrop" onMouseDown={onClose}>
      <section
        className="saving-dialog plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="form-heading">
          <div>
            <p className="eyebrow">
              {budget || reminder ? "Perbarui rencana" : "Rencana baru"}
            </p>
            <h2 id="plan-form-title">
              {type === "budget"
                ? budget
                  ? "Edit anggaran"
                  : "Atur anggaran"
                : reminder
                  ? "Edit pengingat"
                  : "Buat pengingat"}
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
          {type === "budget" ? (
            <fieldset className="type-picker">
              <legend>Anggaran untuk</legend>
              <button
                type="button"
                aria-pressed={scope === "shared"}
                onClick={() => setScope("shared")}
                disabled={Boolean(budget)}
              >
                Bersama
              </button>
              <button
                type="button"
                aria-pressed={scope === "personal"}
                onClick={() => setScope("personal")}
                disabled={Boolean(budget)}
              >
                Pribadi
              </button>
            </fieldset>
          ) : (
            <>
              <label>
                <span>Nama pengingat</span>
                <input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Bayar listrik"
                  required
                />
              </label>
              <label>
                <span>
                  Catatan <small>Opsional</small>
                </span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  placeholder="Sebelum jatuh tempo"
                />
              </label>
            </>
          )}
          <label>
            <span>
              Kategori {type === "reminder" && <small>Opsional</small>}
            </span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required={type === "budget"}
              disabled={Boolean(budget)}
            >
              <option value="">
                {type === "budget" ? "Pilih kategori" : "Tanpa kategori"}
              </option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="amount-field">
            <span>
              {type === "budget" ? "Batas per bulan" : "Perkiraan nominal"}
            </span>
            <div>
              <b>Rp</b>
              <input
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
          {type === "budget" ? (
            <label>
              <span>Peringatkan saat pemakaian</span>
              <div className="threshold-input">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
                <b>{threshold}%</b>
              </div>
            </label>
          ) : (
            <>
              <div className="form-grid">
                <label>
                  <span>Pengulangan</span>
                  <select
                    value={recurrence}
                    onChange={(event) =>
                      setRecurrence(
                        event.target.value as Reminder["recurrenceType"],
                      )
                    }
                  >
                    <option value="once">Sekali</option>
                    <option value="interval_days">Setiap beberapa hari</option>
                    <option value="weekly">Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                </label>
                {recurrence !== "once" && (
                  <label>
                    <span>
                      {recurrence === "weekly"
                        ? "Hari"
                        : recurrence === "monthly"
                          ? "Tanggal"
                          : "Jarak hari"}
                    </span>
                    {recurrence === "weekly" ? (
                      <select
                        value={interval}
                        onChange={(event) => setInterval(event.target.value)}
                      >
                        {[
                          "Minggu",
                          "Senin",
                          "Selasa",
                          "Rabu",
                          "Kamis",
                          "Jumat",
                          "Sabtu",
                        ].map((day, index) => (
                          <option value={index} key={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        inputMode="numeric"
                        value={interval}
                        onChange={(event) =>
                          setInterval(event.target.value.replace(/\D/g, ""))
                        }
                        min="1"
                        max={recurrence === "monthly" ? 31 : undefined}
                        required
                      />
                    )}
                  </label>
                )}
              </div>
              <label>
                <span>
                  Waktu berikutnya <small>WIB</small>
                </span>
                <input
                  type="datetime-local"
                  value={runAt}
                  onChange={(event) => setRunAt(event.target.value)}
                  required
                />
              </label>
              <fieldset className="type-picker">
                <legend>Penerima</legend>
                <button
                  type="button"
                  aria-pressed={recipient === "me"}
                  onClick={() => setRecipient("me")}
                >
                  Kamu
                </button>
                <button
                  type="button"
                  aria-pressed={recipient === "both"}
                  onClick={() => setRecipient("both")}
                  disabled={!partnerId}
                >
                  Berdua
                </button>
                <button
                  type="button"
                  aria-pressed={recipient === "partner"}
                  onClick={() => setRecipient("partner")}
                  disabled={!partnerId}
                >
                  Pasangan
                </button>
              </fieldset>
            </>
          )}
          <fieldset className="channel-picker">
            <legend>Kirim notifikasi melalui</legend>
            <label>
              <input
                type="checkbox"
                checked={web}
                onChange={(event) => setWeb(event.target.checked)}
              />{" "}
              Dashboard
            </label>
            <label>
              <input
                type="checkbox"
                checked={telegram}
                onChange={(event) => setTelegram(event.target.checked)}
              />{" "}
              Telegram
            </label>
          </fieldset>
          {(budget || reminder) && (
            <label className="active-plan-toggle">
              <span>Status rencana</span>
              <button
                className="toggle-switch"
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => setActive((value) => !value)}
              >
                <i />
              </button>
              <b>{active ? "Aktif" : "Nonaktif"}</b>
            </label>
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
                : budget || reminder
                  ? "Simpan perubahan"
                  : "Simpan rencana"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function PlansPage({
  userId,
  allUserIds,
  viewMode,
  hidden,
  online,
}: {
  userId: string;
  allUserIds: string[];
  viewMode: ViewMode;
  hidden: boolean;
  online: boolean;
}) {
  const [tab, setTab] = useState<PlanForm>("budget");
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<PlanFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useAutoRefresh(() => setReload((value) => value + 1), 10_000, online);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);

  useEffect(() => {
    if (online && !stale) return;
    setForm(null);
  }, [online, stale]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadWithSnapshot(userId, "plans", async () => {
      const [budgetData, reminderData, categoryData] = await Promise.all([
        getBudgets(controller.signal),
        getReminders(controller.signal),
        getCategories(controller.signal),
      ]);
      return { budgetData, reminderData, categoryData };
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const { budgetData, reminderData, categoryData } = result.data;
        setBudgets(budgetData.budgets);
        setReminders(reminderData.reminders);
        setCategories(
          categoryData.filter((category) => category.type === "expense"),
        );
        setStale(result.stale);
        setSnapshotAt(result.syncedAt);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.VITE_DEMO_MODE === "true") {
          setBudgets(demoBudgets);
          setReminders(demoReminders);
          setCategories([
            {
              id: "cat-1",
              name: "Makanan & Minuman",
              type: "expense",
              isDefault: true,
              isActive: true,
            },
            {
              id: "cat-2",
              name: "Hiburan",
              type: "expense",
              isDefault: true,
              isActive: true,
            },
            {
              id: "cat-3",
              name: "Tagihan & Cicilan",
              type: "expense",
              isDefault: true,
              isActive: true,
            },
          ]);
          setLoaded(true);
          return;
        }
        setStale(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Rencana belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, userId]);

  function didSave() {
    setForm(null);
    setSaved(true);
    setReload((value) => value + 1);
    window.setTimeout(() => setSaved(false), 3000);
  }
  const visibleBudgets = partitionBudgets(budgets, userId, viewMode);
  const visibleReminders = partitionReminders(reminders, userId, viewMode);
  const list = tab === "budget" ? visibleBudgets : visibleReminders;
  function openCreate() {
    if (!online || stale) return;
    setForm(tab === "budget" ? { type: "budget" } : { type: "reminder" });
  }

  return (
    <section className="plans-page" aria-labelledby="plans-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Biar tidak terlewat</p>
          <h1 id="plans-page-title">Rencana</h1>
          <p>Beri batas untuk hari ini dan pengingat untuk nanti.</p>
        </div>
        <button
          className="quick-add"
          type="button"
          disabled={!online || stale}
          onClick={openCreate}
        >
          + {tab === "budget" ? "Atur anggaran" : "Buat pengingat"}
        </button>
      </div>
      {saved && (
        <div className="success-banner" role="status">
          Rencana berhasil disimpan.
        </div>
      )}
      {stale && snapshotAt && (
        <div className="stale-note" role="status">
          Mode baca saja. Snapshot diperbarui{" "}
          {new Date(snapshotAt).toLocaleString("id-ID")}.
        </div>
      )}
      <div className="plan-tabs" role="tablist" aria-label="Jenis rencana">
        <button
          role="tab"
          aria-selected={tab === "budget"}
          onClick={() => setTab("budget")}
        >
          Anggaran <span>{visibleBudgets.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "reminder"}
          onClick={() => setTab("reminder")}
        >
          Pengingat <span>{visibleReminders.length}</span>
        </button>
      </div>
      {loading && !loaded ? (
        <div className="plan-loading">
          <i />
          <i />
        </div>
      ) : error && !loaded ? (
        <div className="empty-state">
          <span>Rencana belum tersambung</span>
          <p>{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Coba lagi
          </button>
        </div>
      ) : !list.length ? (
        <div className="empty-state">
          <span>Belum ada {tab === "budget" ? "anggaran" : "pengingat"}</span>
          <p>Mulai dengan satu rencana sederhana.</p>
          <button
            className="text-button"
            type="button"
            disabled={!online || stale}
            onClick={openCreate}
          >
            Buat sekarang
          </button>
        </div>
      ) : tab === "budget" ? (
        <div className="budget-list">
          {visibleBudgets.map((budget) => {
            const editable =
              online && !stale && budget.createdByUserId === userId;
            const capped = Math.min(100, budget.percentage);
            return (
              <article
                className={`budget-row ${budget.isActive ? "" : "inactive"}`}
                key={budget.id}
              >
                <div className="budget-icon">
                  {budget.category.name.slice(0, 1)}
                </div>
                <div className="budget-main">
                  <div>
                    <span className={`scope-badge ${budget.ownershipScope}`}>
                      {budget.ownershipScope === "shared"
                        ? "Bersama"
                        : budget.ownerUserId === userId
                          ? "Milikmu"
                          : "Milik pasangan"}
                    </span>
                    {!budget.isActive && (
                      <span className="inactive-badge">Nonaktif</span>
                    )}
                    <h2>{budget.category.name}</h2>
                  </div>
                  <div className="budget-numbers">
                    <b>{hidden ? "Rp ••••••" : money.format(budget.spent)}</b>
                    <span>
                      dari{" "}
                      {hidden ? "Rp ••••••" : money.format(budget.monthlyLimit)}
                    </span>
                  </div>
                  <div
                    className={`budget-progress ${budget.percentage >= 100 ? "over" : budget.percentage >= 75 ? "warning" : ""}`}
                  >
                    <i style={{ width: `${capped}%` }} />
                  </div>
                  <div className="budget-foot">
                    <span>{Math.round(budget.percentage)}% terpakai</span>
                    <span>
                      {budget.remaining < 0 ? "Melebihi" : "Tersisa"}{" "}
                      {hidden
                        ? "Rp ••••••"
                        : money.format(Math.abs(budget.remaining))}
                    </span>
                  </div>
                </div>
                {editable ? (
                  <button
                    className="plan-manage"
                    type="button"
                    onClick={() => setForm({ type: "budget", budget })}
                  >
                    Kelola
                  </button>
                ) : (
                  <span className="readonly-badge">Hanya lihat</span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="reminder-list">
          {visibleReminders.map((reminder) => (
            <article
              className={`reminder-card ${reminder.isActive ? "" : "inactive"}`}
              key={reminder.id}
            >
              <div className="reminder-date">
                <b>
                  {new Date(reminder.nextRunAt).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    timeZone: "Asia/Jakarta",
                  })}
                </b>
                <span>
                  {new Date(reminder.nextRunAt).toLocaleDateString("id-ID", {
                    month: "short",
                    timeZone: "Asia/Jakarta",
                  })}
                </span>
              </div>
              <div className="reminder-main">
                <div className="reminder-tags">
                  <span>{recurrenceLabel(reminder)}</span>
                  {!reminder.isActive && (
                    <span className="inactive-badge">Nonaktif</span>
                  )}
                  <span>
                    {reminder.recipientUserIds.length > 1
                      ? "Berdua"
                      : reminder.recipientUserIds[0] === userId
                        ? "Untukmu"
                        : "Pasangan"}
                  </span>
                </div>
                <h2>{reminder.title}</h2>
                <p>
                  {dateTime.format(new Date(reminder.nextRunAt))} WIB
                  {reminder.amount
                    ? ` · ${hidden ? "Rp ••••••" : money.format(reminder.amount)}`
                    : ""}
                </p>
                <small>
                  {reminder.notifyWeb ? "Dashboard" : ""}
                  {reminder.notifyWeb && reminder.notifyTelegram ? " + " : ""}
                  {reminder.notifyTelegram ? "Telegram" : ""}
                </small>
              </div>
              {online && !stale && reminder.creatorUserId === userId ? (
                <button
                  className="plan-manage"
                  type="button"
                  onClick={() => setForm({ type: "reminder", reminder })}
                >
                  Kelola
                </button>
              ) : (
                <span className="readonly-badge">Dibuat pasangan</span>
              )}
            </article>
          ))}
        </div>
      )}
      {form && (
        <PlanDialog
          form={form}
          categories={categories}
          userId={userId}
          allUserIds={allUserIds}
          onClose={() => setForm(null)}
          onSaved={didSave}
        />
      )}
    </section>
  );
}
