export type ViewMode = "couple" | "solo";

const VIEW_MODE_KEY = "rangkumin-view";

export function getViewMode(): ViewMode {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === "solo" ? "solo" : "couple";
}

export function setViewMode(mode: ViewMode): void {
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

type ScopeItem = {
  ownershipScope: "personal" | "shared";
  ownerUserId: string | null;
};

type BudgetItem = {
  ownershipScope: "personal" | "shared";
  createdByUserId: string;
};

type ReminderItem = {
  recipientUserIds: string[];
  creatorUserId: string;
};

export function partitionGoals<T extends ScopeItem>(
  goals: readonly T[],
  userId: string,
  mode: ViewMode,
): readonly T[] {
  if (mode === "couple") return goals;
  return goals.filter(
    (goal) => goal.ownershipScope === "shared" || goal.ownerUserId === userId,
  );
}

export function partitionBudgets<T extends BudgetItem>(
  budgets: readonly T[],
  userId: string,
  mode: ViewMode,
): readonly T[] {
  if (mode === "couple") return budgets;
  return budgets.filter(
    (budget) =>
      budget.ownershipScope === "shared" || budget.createdByUserId === userId,
  );
}

export function partitionReminders<T extends ReminderItem>(
  reminders: readonly T[],
  userId: string,
  mode: ViewMode,
): readonly T[] {
  if (mode === "couple") return reminders;
  return reminders.filter(
    (reminder) =>
      reminder.recipientUserIds.includes(userId) ||
      reminder.creatorUserId === userId,
  );
}
