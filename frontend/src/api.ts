export type User = { id: string; displayName: string };
export type SummaryItem = {
  userId: string;
  income: number;
  expense: number;
  net: number;
};
type SummaryTotals = Omit<SummaryItem, "userId">;
export type Summary = {
  period: { from: string; to: string };
  byUser: SummaryItem[];
  combined: SummaryTotals & {
    categories: Array<{ categoryId: string; name: string; total: number }>;
  };
};
export type SavingsGoal = {
  id: string;
  createdByUserId?: string;
  name: string;
  ownershipScope: "personal" | "shared";
  ownerUserId: string | null;
  balance: number;
  targetAmount: number | null;
  progressPercentage: number | null;
  archivedAt: string | null;
};
export type SavingsOverview = {
  cashBalances: Array<{ userId: string; balance: number }>;
  goals: SavingsGoal[];
};
export type Transaction = {
  id: string;
  ownerUserId: string;
  type:
    | "income"
    | "expense"
    | "saving_deposit"
    | "saving_withdrawal"
    | "saving_transfer";
  amount: number;
  description: string | null;
  transactionDate: string;
  categoryId?: string | null;
  version?: number;
  deletedAt?: string | null;
  purgeAfter?: string | null;
  category: { id?: string; name: string } | null;
};
export type Category = {
  id: string;
  type: "income" | "expense";
  name: string;
  isDefault: boolean;
  isActive: boolean;
};
export type Budget = {
  id: string;
  createdByUserId: string;
  ownershipScope: "personal" | "shared";
  ownerUserId: string | null;
  category: { id: string; name: string };
  monthlyLimit: number;
  spent: number;
  remaining: number;
  percentage: number;
  startsOn: string;
  isActive: boolean;
  thresholds: Array<{
    id: string;
    percentage: number;
    notifyWeb: boolean;
    notifyTelegram: boolean;
  }>;
};
export type Reminder = {
  id: string;
  creatorUserId: string;
  title: string;
  description: string | null;
  amount: number | null;
  categoryId: string | null;
  recurrenceType: "once" | "interval_days" | "weekly" | "monthly";
  intervalValue: number | null;
  nextRunAt: string;
  timezone: string;
  isActive: boolean;
  notifyWeb: boolean;
  notifyTelegram: boolean;
  recipientUserIds: string[];
};
export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  scheduledFor: string;
  readAt: string | null;
  createdAt: string;
};

export type CreateTransactionInput = {
  type: "income" | "expense";
  amount: number;
  category_id: string;
  transaction_date: string;
  description?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Tidak dapat terhubung ke server.") {
    super(message);
    this.name = "NetworkError";
  }
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sesi perlu diperbarui sebelum data dapat disinkronkan.");
    this.name = "AuthRequiredError";
  }
}

export class InvalidResponseError extends Error {
  constructor() {
    super("Server mengembalikan respons yang tidak dikenali.");
    this.name = "InvalidResponseError";
  }
}

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new NetworkError();
  }

  const finalUrl = new URL(response.url || path, window.location.origin);
  if (
    response.status === 401 ||
    response.type === "opaqueredirect" ||
    (response.redirected && finalUrl.origin !== window.location.origin) ||
    finalUrl.pathname.startsWith("/cdn-cgi/access/")
  ) {
    throw new AuthRequiredError();
  }

  const isJson = response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json");
  const body = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const payload = body as { error?: string; message?: string } | null;
    throw new ApiError(
      payload?.message ?? `Request gagal (${response.status})`,
      response.status,
      payload?.error,
    );
  }

  if (!isJson) throw new InvalidResponseError();
  return body as T;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { signal });
}

export async function getTransactions(
  filters: {
    type?: string;
    category?: string;
    owner?: string;
    offset: number;
    status?: "active" | "trashed";
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    status: filters.status ?? "active",
    limit: "10",
    offset: String(filters.offset),
  });
  if (filters.type) query.set("type", filters.type);
  if (filters.category) query.set("category", filters.category);
  if (filters.owner) query.set("owner", filters.owner);
  return getJson<{
    items: Transaction[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/transactions?${query}`, signal);
}

export async function getTrashedTransactions(
  filters: { owner?: string; offset: number },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    limit: "10",
    offset: String(filters.offset),
  });
  if (filters.owner) query.set("owner", filters.owner);
  return getJson<{
    items: Transaction[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/trash?${query}`, signal);
}

export async function getCategories(signal?: AbortSignal) {
  const [income, expense] = await Promise.all([
    getJson<{ categories: Category[] }>("/api/categories?type=income", signal),
    getJson<{ categories: Category[] }>("/api/categories?type=expense", signal),
  ]);
  return [...income.categories, ...expense.categories];
}

export function createTransaction(
  input: CreateTransactionInput,
  idempotencyKey: string = crypto.randomUUID(),
  expectedActorId?: string,
) {
  return requestJson<{ transaction: Transaction }>("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      ...(expectedActorId ? { "X-Rangkumin-Actor-Id": expectedActorId } : {}),
    },
    body: JSON.stringify(input),
  });
}

export function updateTransaction(
  transactionId: string,
  input: {
    version: number;
    type: "income" | "expense";
    amount: number;
    category_id: string;
    transaction_date: string;
    description: string | null;
  },
) {
  return sendJson<{ transaction: Transaction }>(
    `/api/transactions/${transactionId}`,
    input,
    { method: "PATCH" },
  );
}

async function sendWithoutResponse(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
) {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new NetworkError();
  }
  const finalUrl = new URL(response.url || path, window.location.origin);
  if (
    response.status === 401 ||
    response.type === "opaqueredirect" ||
    (response.redirected && finalUrl.origin !== window.location.origin) ||
    finalUrl.pathname.startsWith("/cdn-cgi/access/")
  ) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(
      payload?.message ?? "Perubahan belum dapat disimpan.",
      response.status,
    );
  }
}

export function deleteTransaction(transactionId: string) {
  return sendWithoutResponse(`/api/transactions/${transactionId}`, "DELETE");
}

export function restoreTransaction(transactionId: string) {
  return sendWithoutResponse(
    `/api/transactions/${transactionId}/restore`,
    "POST",
  );
}

export function purgeTransaction(transactionId: string) {
  return sendWithoutResponse(
    `/api/transactions/${transactionId}/purge`,
    "DELETE",
  );
}

export function getNotifications(signal?: AbortSignal) {
  return getJson<{ notifications: Notification[] }>(
    "/api/notifications",
    signal,
  );
}

export function markNotificationRead(notificationId: string) {
  return sendWithoutResponse(
    `/api/notifications/${notificationId}/read`,
    "PATCH",
  );
}

async function sendJson<T>(
  path: string,
  body: unknown,
  options: { method?: "POST" | "PATCH"; idempotent?: boolean } = {},
) {
  return requestJson<T>(path, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function getIdentity(signal?: AbortSignal) {
  return getJson<{ user: User }>("/api/me", signal);
}

export function createSavingsGoal(input: {
  ownership_scope: "personal" | "shared";
  name: string;
  target_amount?: number;
}) {
  return sendJson<{ goal: SavingsGoal }>("/api/savings/goals", input);
}

export function updateSavingsGoal(
  goalId: string,
  input: { name: string; target_amount: number | null },
) {
  return sendJson<{ goal: SavingsGoal }>(
    `/api/savings/goals/${goalId}`,
    input,
    {
      method: "PATCH",
    },
  );
}

export function setSavingsGoalArchived(goalId: string, archived: boolean) {
  return sendJson<{ goal: SavingsGoal }>(
    `/api/savings/goals/${goalId}/archive`,
    { archived },
    { method: "PATCH" },
  );
}

export function mutateSavingsGoal(
  goalId: string,
  kind: "deposits" | "withdrawals",
  input: { amount: number; transaction_date: string; description?: string },
) {
  return sendJson<{ mutation: unknown }>(
    `/api/savings/goals/${goalId}/${kind}`,
    input,
    {
      idempotent: true,
    },
  );
}

export function transferSavings(input: {
  source_goal_id: string;
  destination_goal_id: string;
  amount: number;
  transaction_date: string;
  description?: string;
}) {
  return sendJson<{ mutation: unknown }>("/api/savings/transfers", input, {
    idempotent: true,
  });
}

export function getSavingsOverview(signal?: AbortSignal) {
  return getJson<SavingsOverview>("/api/savings/overview", signal);
}

export function getBudgets(signal?: AbortSignal) {
  return getJson<{ period: string; budgets: Budget[] }>(
    "/api/budgets?inactive=true",
    signal,
  );
}

export function getReminders(signal?: AbortSignal) {
  return getJson<{ reminders: Reminder[] }>(
    "/api/reminders?inactive=true",
    signal,
  );
}

export function createBudget(input: {
  ownership_scope: "personal" | "shared";
  category_id: string;
  monthly_limit: number;
  starts_on: string;
  thresholds: Array<{
    percentage: number;
    notify_web: boolean;
    notify_telegram: boolean;
  }>;
}) {
  return sendJson<{ budget: { id: string } }>("/api/budgets", input);
}

export function updateBudget(
  budgetId: string,
  input: {
    monthly_limit: number;
    is_active: boolean;
    thresholds: Array<{
      percentage: number;
      notify_web: boolean;
      notify_telegram: boolean;
    }>;
  },
) {
  return sendJson<{ updated: true }>(`/api/budgets/${budgetId}`, input, {
    method: "PATCH",
  });
}

export function createReminder(input: {
  title: string;
  description?: string;
  amount?: number;
  category_id?: string;
  recurrence_type: Reminder["recurrenceType"];
  interval_value?: number;
  next_run_at: string;
  recipient_user_ids: string[];
  notify_web: boolean;
  notify_telegram: boolean;
}) {
  return sendJson<{ reminder: { id: string } }>("/api/reminders", input);
}

export function updateReminder(
  reminderId: string,
  input: {
    title: string;
    description: string | null;
    amount: number | null;
    category_id: string | null;
    recurrence_type: Reminder["recurrenceType"];
    interval_value: number | null;
    next_run_at: string;
    recipient_user_ids: string[];
    notify_web: boolean;
    notify_telegram: boolean;
    is_active: boolean;
  },
) {
  return sendJson<{ reminder: Reminder }>(
    `/api/reminders/${reminderId}`,
    input,
    {
      method: "PATCH",
    },
  );
}

export async function getDashboard(signal?: AbortSignal, solo = false) {
  const identity = await getIdentity(signal);
  const summaryUrl = solo
    ? `/api/summary?owner=${encodeURIComponent(identity.user.id)}`
    : "/api/summary";
  const [summary, savings, transactions, notifications, categories] =
    await Promise.all([
      getJson<Summary>(summaryUrl, signal),
      getJson<SavingsOverview>("/api/savings/overview", signal),
      getJson<{ items: Transaction[] }>(
        "/api/transactions?status=active&limit=5&offset=0",
        signal,
      ),
      getJson<{ notifications: Array<{ id: string; readAt: string | null }> }>(
        "/api/notifications",
        signal,
      ),
      getCategories(signal),
    ]);
  return {
    user: identity.user,
    summary,
    savings,
    transactions: transactions.items,
    unread: notifications.notifications.filter((item) => !item.readAt).length,
    categories,
  };
}
