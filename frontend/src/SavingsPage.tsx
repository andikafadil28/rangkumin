import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAutoRefresh } from "./useAutoRefresh";
import {
  createSavingsGoal,
  getSavingsOverview,
  mutateSavingsGoal,
  setSavingsGoalArchived,
  transferSavings,
  updateSavingsGoal,
} from "./api";
import type { SavingsGoal, SavingsOverview } from "./api";

type Operation =
  | { kind: "create" }
  | { kind: "edit"; goal: SavingsGoal }
  | { kind: "deposit" | "withdraw"; goal: SavingsGoal }
  | { kind: "transfer" };

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayMoney(value: number, hidden: boolean) {
  return hidden ? "Rp ••••••" : money.format(value);
}

function SavingsForm({
  operation,
  goals,
  onClose,
  onSaved,
  onArchive,
}: {
  operation: Operation;
  goals: SavingsGoal[];
  onClose: () => void;
  onSaved: () => void;
  onArchive: (goal: SavingsGoal) => void;
}) {
  const [scope, setScope] = useState<"personal" | "shared">("shared");
  const [name, setName] = useState(
    operation.kind === "edit" ? operation.goal.name : "",
  );
  const [target, setTarget] = useState(
    operation.kind === "edit" && operation.goal.targetAmount
      ? String(operation.goal.targetAmount)
      : "",
  );
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const title =
    operation.kind === "create"
      ? "Buat pos tabungan"
      : operation.kind === "edit"
        ? "Kelola pos tabungan"
        : operation.kind === "deposit"
          ? `Setor ke ${operation.goal.name}`
          : operation.kind === "withdraw"
            ? `Tarik dari ${operation.goal.name}`
            : "Pindahkan tabungan";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (operation.kind === "create" || operation.kind === "edit") {
        const numericTarget = target ? Number(target) : undefined;
        if (
          numericTarget !== undefined &&
          (!Number.isSafeInteger(numericTarget) || numericTarget <= 0)
        ) {
          throw new Error("Target harus berupa angka bulat lebih dari nol.");
        }
        if (operation.kind === "create") {
          await createSavingsGoal({
            ownership_scope: scope,
            name: name.trim(),
            ...(numericTarget ? { target_amount: numericTarget } : {}),
          });
        } else {
          await updateSavingsGoal(operation.goal.id, {
            name: name.trim(),
            target_amount: numericTarget ?? null,
          });
        }
      } else {
        const numericAmount = Number(amount);
        if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
          throw new Error("Nominal harus berupa angka bulat lebih dari nol.");
        }
        const common = {
          amount: numericAmount,
          transaction_date: date,
          ...(description.trim() ? { description: description.trim() } : {}),
        };
        if (operation.kind === "transfer") {
          if (!sourceId || !destinationId || sourceId === destinationId) {
            throw new Error("Pilih dua pos tabungan yang berbeda.");
          }
          await transferSavings({
            source_goal_id: sourceId,
            destination_goal_id: destinationId,
            ...common,
          });
        } else {
          await mutateSavingsGoal(
            operation.goal.id,
            operation.kind === "deposit" ? "deposits" : "withdrawals",
            common,
          );
        }
      }
      onSaved();
    } catch (cause) {
      if (import.meta.env.DEV && cause instanceof TypeError) {
        onSaved();
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
    <div className="dialog-backdrop saving-backdrop" onMouseDown={onClose}>
      <section
        className="saving-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saving-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="form-heading">
          <div>
            <p className="eyebrow">Tabungan</p>
            <h2 id="saving-form-title">{title}</h2>
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
          {operation.kind === "create" || operation.kind === "edit" ? (
            <>
              {operation.kind === "create" && (
                <fieldset className="type-picker">
                  <legend>Kepemilikan pos</legend>
                  <button
                    type="button"
                    aria-pressed={scope === "shared"}
                    onClick={() => setScope("shared")}
                  >
                    Bersama
                  </button>
                  <button
                    type="button"
                    aria-pressed={scope === "personal"}
                    onClick={() => setScope("personal")}
                  >
                    Pribadi
                  </button>
                </fieldset>
              )}
              <label>
                <span>Nama tujuan</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="Rumah pertama"
                  required
                />
              </label>
              <label className="amount-field">
                <span>
                  Target <small>Opsional</small>
                </span>
                <div>
                  <b>Rp</b>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={target}
                    onChange={(event) =>
                      setTarget(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="0"
                  />
                </div>
              </label>
            </>
          ) : (
            <>
              {operation.kind === "transfer" && (
                <div className="form-grid">
                  <label>
                    <span>Dari pos</span>
                    <select
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                      required
                    >
                      <option value="">Pilih sumber</option>
                      {goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Ke pos</span>
                    <select
                      value={destinationId}
                      onChange={(event) => setDestinationId(event.target.value)}
                      required
                    >
                      <option value="">Pilih tujuan</option>
                      {goals
                        .filter((goal) => goal.id !== sourceId)
                        .map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goal.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
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
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Untuk tujuan ini..."
                />
              </label>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {operation.kind === "edit" && (
            <button
              className="danger-link"
              type="button"
              onClick={() => onArchive(operation.goal)}
            >
              Arsipkan pos ini
            </button>
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
                : operation.kind === "create"
                  ? "Buat pos"
                  : operation.kind === "edit"
                    ? "Simpan perubahan"
                    : "Simpan"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ArchiveGoalDialog({
  goal,
  onClose,
  onArchived,
}: {
  goal: SavingsGoal;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setSubmitting(true);
    try {
      await setSavingsGoalArchived(goal.id, !goal.archivedAt);
      onArchived();
    } catch (cause) {
      if (import.meta.env.DEV && cause instanceof TypeError) {
        onArchived();
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Status pos belum dapat diubah.",
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
        aria-labelledby="archive-goal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="danger">!</span>
        <h2 id="archive-goal-title">
          {goal.archivedAt ? "Aktifkan kembali" : "Arsipkan"} {goal.name}?
        </h2>
        <p>
          {goal.archivedAt
            ? "Pos akan kembali ke daftar aktif dan dapat digunakan untuk mutasi tabungan."
            : "Pos disembunyikan dari daftar aktif. Saldo dan seluruh riwayatnya tetap tersimpan."}
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
            className="danger-button"
            type="button"
            disabled={submitting}
            onClick={() => void archive()}
          >
            {submitting
              ? "Memproses..."
              : goal.archivedAt
                ? "Aktifkan pos"
                : "Arsipkan pos"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function SavingsPage({
  userId,
  hidden,
  openCreate,
  onCreateHandled,
}: {
  userId: string;
  hidden: boolean;
  openCreate: boolean;
  onCreateHandled: () => void;
}) {
  const [overview, setOverview] = useState<SavingsOverview | null>(null);
  const [operation, setOperation] = useState<Operation | null>(
    openCreate ? { kind: "create" } : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useAutoRefresh(() => setReload((value) => value + 1));
  const [saved, setSaved] = useState(false);
  const [archiveGoal, setArchiveGoal] = useState<SavingsGoal | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");

  useEffect(() => {
    if (openCreate) setOperation({ kind: "create" });
  }, [openCreate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getSavingsOverview(controller.signal)
      .then(setOverview)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) {
          void import("./demo").then(({ demoDashboard }) =>
            setOverview(demoDashboard.savings),
          );
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Tabungan belum dapat dimuat.",
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [reload]);

  function canMutate(goal: SavingsGoal) {
    return goal.ownershipScope === "shared" || goal.ownerUserId === userId;
  }

  function canEdit(goal: SavingsGoal) {
    return goal.ownershipScope === "personal"
      ? goal.ownerUserId === userId
      : goal.createdByUserId === userId;
  }

  function closeForm() {
    setOperation(null);
    onCreateHandled();
  }

  function savedGoal() {
    closeForm();
    setSaved(true);
    setReload((value) => value + 1);
    window.setTimeout(() => setSaved(false), 3000);
  }

  const activeGoals = overview?.goals.filter((goal) => !goal.archivedAt) ?? [];
  const archivedGoals = overview?.goals.filter((goal) => goal.archivedAt) ?? [];
  const goals = view === "active" ? activeGoals : archivedGoals;
  const accessibleGoals = goals.filter(canMutate);
  const total = activeGoals.reduce((sum, goal) => sum + goal.balance, 0);
  const shared = activeGoals
    .filter((goal) => goal.ownershipScope === "shared")
    .reduce((sum, goal) => sum + goal.balance, 0);

  return (
    <section className="savings-page" aria-labelledby="savings-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tujuan yang dijaga</p>
          <h1 id="savings-page-title">Tabungan</h1>
          <p>Setiap pos punya cerita, pemilik, dan langkahnya sendiri.</p>
        </div>
        <div className="page-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={view === "archived" || accessibleGoals.length < 2}
            onClick={() => setOperation({ kind: "transfer" })}
          >
            Pindahkan
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
            {view === "active" ? `Arsip (${archivedGoals.length})` : "Kembali"}
          </button>
          {view === "active" && (
            <button
              className="quick-add"
              type="button"
              onClick={() => setOperation({ kind: "create" })}
            >
              + Buat pos
            </button>
          )}
        </div>
      </div>
      {saved && (
        <div className="success-banner" role="status">
          Perubahan tabungan berhasil disimpan.
        </div>
      )}
      <section className="savings-hero">
        <div>
          <p className="eyebrow light">Tumbuh perlahan</p>
          <span>Total seluruh tabungan</span>
          <strong>{displayMoney(total, hidden)}</strong>
        </div>
        <div>
          <span>Pos bersama</span>
          <b>{displayMoney(shared, hidden)}</b>
          <small>
            {
              activeGoals.filter((goal) => goal.ownershipScope === "shared")
                .length
            }{" "}
            tujuan aktif
          </small>
        </div>
        <div>
          <span>Pos personal</span>
          <b>{displayMoney(total - shared, hidden)}</b>
          <small>
            {
              activeGoals.filter((goal) => goal.ownershipScope === "personal")
                .length
            }{" "}
            tujuan aktif
          </small>
        </div>
      </section>
      {loading ? (
        <div className="savings-loading">
          <i />
          <i />
          <i />
        </div>
      ) : error ? (
        <div className="empty-state">
          <span>Tabungan belum tersambung</span>
          <p>{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Coba lagi
          </button>
        </div>
      ) : goals.length ? (
        <div className="savings-grid">
          {goals.map((goal, index) => {
            const mutable = canMutate(goal);
            const editable = canEdit(goal);
            return (
              <article
                className={`saving-goal tone-${index % 3}`}
                key={goal.id}
              >
                <div className="goal-top">
                  <span className={`scope-badge ${goal.ownershipScope}`}>
                    {goal.ownershipScope === "shared"
                      ? "Bersama"
                      : goal.ownerUserId === userId
                        ? "Milikmu"
                        : "Milik pasangan"}
                  </span>
                  {editable ? (
                    <button
                      className="goal-menu"
                      type="button"
                      onClick={() =>
                        view === "archived"
                          ? setArchiveGoal(goal)
                          : setOperation({ kind: "edit", goal })
                      }
                    >
                      {view === "archived" ? "Aktifkan" : "Kelola"}
                    </button>
                  ) : (
                    (view === "archived" || !mutable) && (
                      <span className="readonly-badge">Hanya lihat</span>
                    )
                  )}
                </div>
                <h2>{goal.name}</h2>
                <p>{displayMoney(goal.balance, hidden)}</p>
                <div className="goal-progress">
                  <i
                    style={{
                      width: `${Math.min(100, goal.progressPercentage ?? 0)}%`,
                    }}
                  />
                </div>
                <div className="goal-meta">
                  <span>
                    {goal.targetAmount
                      ? `${Math.round(goal.progressPercentage ?? 0)}% terkumpul`
                      : "Tanpa target"}
                  </span>
                  <span>
                    {goal.targetAmount
                      ? displayMoney(goal.targetAmount, hidden)
                      : "Fleksibel"}
                  </span>
                </div>
                {view === "active" && (
                  <div className="goal-actions">
                    <button
                      type="button"
                      disabled={!mutable}
                      onClick={() => setOperation({ kind: "deposit", goal })}
                    >
                      Setor
                    </button>
                    <button
                      type="button"
                      disabled={!mutable || goal.balance <= 0}
                      onClick={() => setOperation({ kind: "withdraw", goal })}
                    >
                      Tarik
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state savings-empty">
          <span>Belum ada tujuan</span>
          <p>
            {view === "archived"
              ? "Pos yang diarsipkan akan tersimpan di sini."
              : "Buat satu pos kecil untuk sesuatu yang ingin dijaga."}
          </p>
          {view === "active" && (
            <button
              className="quick-add"
              type="button"
              onClick={() => setOperation({ kind: "create" })}
            >
              Buat pos pertama
            </button>
          )}
        </div>
      )}
      {operation && (
        <SavingsForm
          operation={operation}
          goals={accessibleGoals}
          onClose={closeForm}
          onSaved={savedGoal}
          onArchive={(goal) => {
            setOperation(null);
            setArchiveGoal(goal);
          }}
        />
      )}
      {archiveGoal && (
        <ArchiveGoalDialog
          goal={archiveGoal}
          onClose={() => setArchiveGoal(null)}
          onArchived={() => {
            setArchiveGoal(null);
            savedGoal();
          }}
        />
      )}
    </section>
  );
}
