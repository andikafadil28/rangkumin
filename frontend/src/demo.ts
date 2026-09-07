import type {
  Budget,
  Category,
  Notification,
  Reminder,
  SavingsGoal,
  SavingsOverview,
  Summary,
  Transaction,
  User,
} from "./api";

type DemoState = {
  categories: Category[];
  transactions: Transaction[];
  goals: SavingsGoal[];
  budgets: Budget[];
  reminders: Reminder[];
  notifications: Notification[];
  idempotency: Map<string, Transaction>;
};

const users: User[] = [
  { id: "demo-user-1", displayName: "Ari" },
  { id: "demo-user-2", displayName: "Dara" },
];
const currentUser = users[0]!;

function localDate(day: number) {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    from: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    to: `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function category(id: string, type: Category["type"], name: string): Category {
  return { id, type, name, isDefault: true, isActive: true };
}

function createInitialState(): DemoState {
  const categories = [
    category("income-salary", "income", "Gaji"),
    category("income-freelance", "income", "Freelance"),
    category("income-bonus", "income", "Bonus"),
    category("income-other", "income", "Lainnya"),
    category("expense-food", "expense", "Makanan & Minuman"),
    category("expense-transport", "expense", "Transport"),
    category("expense-bills", "expense", "Tagihan & Cicilan"),
    category("expense-entertainment", "expense", "Hiburan"),
    category("expense-shopping", "expense", "Belanja"),
    category("expense-health", "expense", "Kesehatan"),
    category("expense-education", "expense", "Pendidikan"),
    category("expense-other", "expense", "Lainnya"),
  ];
  const categoryRef = (id: string) => {
    const item = categories.find((entry) => entry.id === id)!;
    return { id: item.id, name: item.name };
  };
  const transaction = (
    id: string,
    ownerUserId: string,
    type: "income" | "expense",
    amount: number,
    categoryId: string,
    day: number,
    description: string,
  ): Transaction => ({
    id,
    ownerUserId,
    type,
    amount,
    description,
    transactionDate: localDate(day),
    categoryId,
    version: 1,
    deletedAt: null,
    purgeAfter: null,
    category: categoryRef(categoryId),
  });
  const transactions = [
    transaction(
      "transaction-1",
      users[0]!.id,
      "income",
      8_500_000,
      "income-salary",
      1,
      "Gaji bulanan",
    ),
    transaction(
      "transaction-2",
      users[1]!.id,
      "income",
      7_200_000,
      "income-salary",
      1,
      "Gaji bulanan",
    ),
    transaction(
      "transaction-3",
      users[0]!.id,
      "expense",
      420_000,
      "expense-food",
      2,
      "Makan malam",
    ),
    transaction(
      "transaction-4",
      users[1]!.id,
      "expense",
      185_000,
      "expense-shopping",
      3,
      "Belanja mingguan",
    ),
    transaction(
      "transaction-5",
      users[0]!.id,
      "expense",
      425_000,
      "expense-bills",
      4,
      "Internet rumah",
    ),
    transaction(
      "transaction-6",
      users[1]!.id,
      "expense",
      160_000,
      "expense-transport",
      5,
      "Transport harian",
    ),
    transaction(
      "transaction-7",
      users[0]!.id,
      "expense",
      240_000,
      "expense-entertainment",
      6,
      "Nonton berdua",
    ),
  ];
  const now = new Date().toISOString();
  return {
    categories,
    transactions,
    goals: [
      {
        id: "goal-1",
        createdByUserId: users[0]!.id,
        name: "Rumah pertama",
        ownershipScope: "shared",
        ownerUserId: null,
        balance: 38_500_000,
        targetAmount: 150_000_000,
        progressPercentage: 25.67,
        archivedAt: null,
      },
      {
        id: "goal-2",
        createdByUserId: users[1]!.id,
        name: "Liburan akhir tahun",
        ownershipScope: "shared",
        ownerUserId: null,
        balance: 8_750_000,
        targetAmount: 15_000_000,
        progressPercentage: 58.33,
        archivedAt: null,
      },
      {
        id: "goal-3",
        createdByUserId: users[0]!.id,
        name: "Dana tenang",
        ownershipScope: "personal",
        ownerUserId: users[0]!.id,
        balance: 12_000_000,
        targetAmount: null,
        progressPercentage: null,
        archivedAt: null,
      },
    ],
    budgets: [
      {
        id: "budget-1",
        createdByUserId: users[0]!.id,
        ownershipScope: "shared",
        ownerUserId: null,
        category: categoryRef("expense-food"),
        monthlyLimit: 3_000_000,
        spent: 420_000,
        remaining: 2_580_000,
        percentage: 14,
        startsOn: monthPeriod().from,
        isActive: true,
        thresholds: [
          {
            id: "threshold-1",
            percentage: 80,
            notifyWeb: true,
            notifyTelegram: false,
          },
        ],
      },
      {
        id: "budget-2",
        createdByUserId: users[0]!.id,
        ownershipScope: "personal",
        ownerUserId: users[0]!.id,
        category: categoryRef("expense-entertainment"),
        monthlyLimit: 750_000,
        spent: 240_000,
        remaining: 510_000,
        percentage: 32,
        startsOn: monthPeriod().from,
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
    ],
    reminders: [
      {
        id: "reminder-1",
        creatorUserId: users[0]!.id,
        title: "Bayar internet rumah",
        description: "Sebelum jatuh tempo",
        amount: 425_000,
        categoryId: "expense-bills",
        recurrenceType: "monthly",
        intervalValue: 10,
        nextRunAt: `${localDate(10)}T02:00:00.000Z`,
        timezone: "Asia/Jakarta",
        isActive: true,
        notifyWeb: true,
        notifyTelegram: false,
        recipientUserIds: users.map((user) => user.id),
      },
      {
        id: "reminder-2",
        creatorUserId: users[1]!.id,
        title: "Iuran lingkungan",
        description: null,
        amount: 100_000,
        categoryId: null,
        recurrenceType: "monthly",
        intervalValue: 15,
        nextRunAt: `${localDate(15)}T12:00:00.000Z`,
        timezone: "Asia/Jakarta",
        isActive: true,
        notifyWeb: true,
        notifyTelegram: false,
        recipientUserIds: users.map((user) => user.id),
      },
    ],
    notifications: [
      {
        id: "notification-1",
        kind: "budget_threshold",
        title: "Anggaran Hiburan perlu diperhatikan",
        body: "Cek kembali pengeluaran hiburan kalian bulan ini.",
        scheduledFor: now,
        createdAt: now,
        readAt: null,
      },
      {
        id: "notification-2",
        kind: "reminder",
        title: "Internet rumah segera jatuh tempo",
        body: "Pengingat bersama untuk membayar internet rumah.",
        scheduledFor: now,
        createdAt: now,
        readAt: null,
      },
    ],
    idempotency: new Map(),
  };
}

let state = createInitialState();

export function resetDemoStore() {
  state = createInitialState();
}

function parseBody<T>(options: RequestInit): T {
  return JSON.parse(String(options.body ?? "{}")) as T;
}

function findCategory(categoryId: string) {
  const item = state.categories.find((entry) => entry.id === categoryId);
  if (!item) throw new Error("Kategori demo tidak ditemukan.");
  return item;
}

function recalculateGoal(goal: SavingsGoal) {
  goal.progressPercentage = goal.targetAmount
    ? Math.round((goal.balance / goal.targetAmount) * 10_000) / 100
    : null;
}

function summary(owner?: string): Summary {
  const period = monthPeriod();
  const active = state.transactions.filter(
    (item) =>
      !item.deletedAt &&
      item.transactionDate >= period.from &&
      item.transactionDate <= period.to &&
      (!owner || item.ownerUserId === owner),
  );
  const byUser = users
    .filter((user) => !owner || user.id === owner)
    .map((user) => {
      const owned = active.filter((item) => item.ownerUserId === user.id);
      const income = owned
        .filter((item) => item.type === "income")
        .reduce((total, item) => total + item.amount, 0);
      const expense = owned
        .filter((item) => item.type === "expense")
        .reduce((total, item) => total + item.amount, 0);
      return { userId: user.id, income, expense, net: income - expense };
    });
  const categoryTotals = new Map<
    string,
    { categoryId: string; name: string; total: number }
  >();
  for (const item of active.filter(
    (entry) => entry.type === "expense" && entry.category,
  )) {
    const categoryId =
      item.categoryId ?? item.category!.id ?? item.category!.name;
    const existing = categoryTotals.get(categoryId);
    if (existing) existing.total += item.amount;
    else
      categoryTotals.set(categoryId, {
        categoryId,
        name: item.category!.name,
        total: item.amount,
      });
  }
  const income = byUser.reduce((total, item) => total + item.income, 0);
  const expense = byUser.reduce((total, item) => total + item.expense, 0);
  return {
    period,
    byUser,
    combined: {
      income,
      expense,
      net: income - expense,
      categories: [...categoryTotals.values()].sort(
        (a, b) => b.total - a.total,
      ),
    },
  };
}

function savingsOverview(): SavingsOverview {
  return {
    cashBalances: users.map((user) => ({
      userId: user.id,
      balance: state.transactions
        .filter((item) => !item.deletedAt && item.ownerUserId === user.id)
        .reduce((total, item) => {
          if (item.type === "income" || item.type === "saving_withdrawal")
            return total + item.amount;
          if (item.type === "expense" || item.type === "saving_deposit")
            return total - item.amount;
          return total;
        }, 0),
    })),
    goals: clone(state.goals),
  };
}

function listTransactions(url: URL, trashed = false) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const owner = url.searchParams.get("owner");
  const type = url.searchParams.get("type");
  const categoryId = url.searchParams.get("category");
  const items = state.transactions
    .filter((item) => Boolean(item.deletedAt) === trashed)
    .filter((item) => !owner || item.ownerUserId === owner)
    .filter((item) => !type || item.type === type)
    .filter((item) => !categoryId || item.categoryId === categoryId)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  return {
    items: clone(items.slice(offset, offset + 10)),
    total: items.length,
    limit: 10,
    offset,
  };
}

function refreshBudgets() {
  const period = monthPeriod();
  for (const budget of state.budgets) {
    budget.spent = state.transactions
      .filter(
        (item) =>
          !item.deletedAt &&
          item.type === "expense" &&
          item.categoryId === budget.category.id &&
          item.transactionDate >= period.from &&
          item.transactionDate <= period.to &&
          (!budget.ownerUserId || item.ownerUserId === budget.ownerUserId),
      )
      .reduce((total, item) => total + item.amount, 0);
    budget.remaining = budget.monthlyLimit - budget.spent;
    budget.percentage = budget.monthlyLimit
      ? Math.round((budget.spent / budget.monthlyLimit) * 10_000) / 100
      : 0;
  }
}

function demoUnavailable(feature: string): never {
  throw new Error(`${feature} tidak tersedia pada demo publik.`);
}

export async function demoRequestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const url = new URL(path, "https://demo.rangkumin.invalid");
  const method = options.method ?? "GET";
  const pathname = url.pathname;

  if (pathname === "/api/me" && method === "GET")
    return clone({ user: currentUser }) as T;
  if (pathname === "/api/categories" && method === "GET") {
    const type = url.searchParams.get("type");
    return clone({
      categories: state.categories.filter(
        (item) => !type || item.type === type,
      ),
    }) as T;
  }
  if (pathname === "/api/summary" && method === "GET")
    return clone(summary(url.searchParams.get("owner") ?? undefined)) as T;
  if (pathname === "/api/transactions" && method === "GET")
    return listTransactions(url) as T;
  if (pathname === "/api/trash" && method === "GET")
    return listTransactions(url, true) as T;
  if (pathname === "/api/notifications" && method === "GET")
    return clone({ notifications: state.notifications }) as T;
  if (pathname === "/api/savings/overview" && method === "GET")
    return savingsOverview() as T;
  if (pathname === "/api/budgets" && method === "GET") {
    refreshBudgets();
    return clone({
      period: monthPeriod().from.slice(0, 7),
      budgets: state.budgets,
    }) as T;
  }
  if (pathname === "/api/reminders" && method === "GET")
    return clone({ reminders: state.reminders }) as T;
  if (pathname === "/api/push/status" && method === "GET") {
    return {
      subscribed: false,
      deviceId: url.searchParams.get("device_id") ?? "demo",
      publicKey: "",
      expirationTime: null,
      createdAt: null,
      updatedAt: null,
    } as T;
  }
  if (pathname === "/api/receipt-scans") demoUnavailable("Scan Struk");
  if (pathname.startsWith("/api/import/")) demoUnavailable("Import data");

  if (pathname === "/api/transactions" && method === "POST") {
    const input = parseBody<{
      type: "income" | "expense";
      amount: number;
      category_id: string;
      transaction_date: string;
      description?: string;
    }>(options);
    const key = new Headers(options.headers).get("Idempotency-Key");
    const existing = key ? state.idempotency.get(key) : undefined;
    if (existing) return clone({ transaction: existing }) as T;
    const selectedCategory = findCategory(input.category_id);
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      ownerUserId: currentUser.id,
      type: input.type,
      amount: input.amount,
      description: input.description?.trim() || null,
      transactionDate: input.transaction_date,
      categoryId: selectedCategory.id,
      category: { id: selectedCategory.id, name: selectedCategory.name },
      version: 1,
      deletedAt: null,
      purgeAfter: null,
    };
    state.transactions.push(transaction);
    if (key) state.idempotency.set(key, transaction);
    return clone({ transaction }) as T;
  }

  const transactionMatch = pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (transactionMatch && method === "PATCH") {
    const transaction = state.transactions.find(
      (item) => item.id === transactionMatch[1],
    );
    if (!transaction) throw new Error("Transaksi demo tidak ditemukan.");
    const input = parseBody<{
      type: "income" | "expense";
      amount: number;
      category_id: string;
      transaction_date: string;
      description: string | null;
    }>(options);
    const selectedCategory = findCategory(input.category_id);
    Object.assign(transaction, {
      type: input.type,
      amount: input.amount,
      description: input.description,
      transactionDate: input.transaction_date,
      categoryId: selectedCategory.id,
      category: { id: selectedCategory.id, name: selectedCategory.name },
      version: (transaction.version ?? 1) + 1,
    });
    return clone({ transaction }) as T;
  }

  if (pathname === "/api/savings/goals" && method === "POST") {
    const input = parseBody<{
      ownership_scope: "personal" | "shared";
      name: string;
      target_amount?: number;
    }>(options);
    const goal: SavingsGoal = {
      id: crypto.randomUUID(),
      createdByUserId: currentUser.id,
      name: input.name,
      ownershipScope: input.ownership_scope,
      ownerUserId: input.ownership_scope === "personal" ? currentUser.id : null,
      balance: 0,
      targetAmount: input.target_amount ?? null,
      progressPercentage: input.target_amount ? 0 : null,
      archivedAt: null,
    };
    state.goals.push(goal);
    return clone({ goal }) as T;
  }

  if (pathname === "/api/savings/transfers" && method === "POST") {
    const input = parseBody<{
      source_goal_id: string;
      destination_goal_id: string;
      amount: number;
      transaction_date: string;
      description?: string;
    }>(options);
    const source = state.goals.find((item) => item.id === input.source_goal_id);
    const destination = state.goals.find(
      (item) => item.id === input.destination_goal_id,
    );
    if (!source || !destination)
      throw new Error("Pos tabungan demo tidak ditemukan.");
    if (source.balance < input.amount)
      throw new Error("Saldo pos tabungan tidak mencukupi.");
    source.balance -= input.amount;
    destination.balance += input.amount;
    recalculateGoal(source);
    recalculateGoal(destination);
    state.transactions.push({
      id: crypto.randomUUID(),
      ownerUserId: currentUser.id,
      type: "saving_transfer",
      amount: input.amount,
      description:
        input.description?.trim() ||
        `Transfer ${source.name} ke ${destination.name}`,
      transactionDate: input.transaction_date,
      categoryId: null,
      category: null,
      version: 1,
      deletedAt: null,
      purgeAfter: null,
    });
    return { mutation: { id: crypto.randomUUID() } } as T;
  }

  const goalMatch = pathname.match(
    /^\/api\/savings\/goals\/([^/]+)(?:\/(archive|deposits|withdrawals))?$/,
  );
  if (goalMatch) {
    const goal = state.goals.find((item) => item.id === goalMatch[1]);
    if (!goal) throw new Error("Pos tabungan demo tidak ditemukan.");
    if (goalMatch[2] === "archive" && method === "PATCH") {
      const input = parseBody<{ archived: boolean }>(options);
      goal.archivedAt = input.archived ? new Date().toISOString() : null;
      return clone({ goal }) as T;
    }
    if (
      (goalMatch[2] === "deposits" || goalMatch[2] === "withdrawals") &&
      method === "POST"
    ) {
      const input = parseBody<{
        amount: number;
        transaction_date: string;
        description?: string;
      }>(options);
      const cashBalance = savingsOverview().cashBalances.find(
        (item) => item.userId === currentUser.id,
      )!.balance;
      if (goalMatch[2] === "deposits" && cashBalance < input.amount)
        throw new Error("Saldo tunai tidak mencukupi.");
      if (goalMatch[2] === "withdrawals" && goal.balance < input.amount)
        throw new Error("Saldo pos tabungan tidak mencukupi.");
      goal.balance +=
        goalMatch[2] === "deposits" ? input.amount : -input.amount;
      recalculateGoal(goal);
      state.transactions.push({
        id: crypto.randomUUID(),
        ownerUserId: currentUser.id,
        type:
          goalMatch[2] === "deposits" ? "saving_deposit" : "saving_withdrawal",
        amount: input.amount,
        description:
          input.description?.trim() ||
          `${goalMatch[2] === "deposits" ? "Setoran" : "Penarikan"} ${goal.name}`,
        transactionDate: input.transaction_date,
        categoryId: null,
        category: null,
        version: 1,
        deletedAt: null,
        purgeAfter: null,
      });
      return { mutation: { id: crypto.randomUUID() } } as T;
    }
    if (!goalMatch[2] && method === "PATCH") {
      const input = parseBody<{ name: string; target_amount: number | null }>(
        options,
      );
      goal.name = input.name;
      goal.targetAmount = input.target_amount;
      recalculateGoal(goal);
      return clone({ goal }) as T;
    }
  }

  if (pathname === "/api/budgets" && method === "POST") {
    const input = parseBody<{
      ownership_scope: "personal" | "shared";
      category_id: string;
      monthly_limit: number;
      starts_on: string;
      thresholds: Array<{
        percentage: number;
        notify_web: boolean;
        notify_telegram: boolean;
      }>;
    }>(options);
    const selectedCategory = findCategory(input.category_id);
    const budget: Budget = {
      id: crypto.randomUUID(),
      createdByUserId: currentUser.id,
      ownershipScope: input.ownership_scope,
      ownerUserId: input.ownership_scope === "personal" ? currentUser.id : null,
      category: { id: selectedCategory.id, name: selectedCategory.name },
      monthlyLimit: input.monthly_limit,
      spent: 0,
      remaining: input.monthly_limit,
      percentage: 0,
      startsOn: input.starts_on,
      isActive: true,
      thresholds: input.thresholds.map((item) => ({
        id: crypto.randomUUID(),
        percentage: item.percentage,
        notifyWeb: item.notify_web,
        notifyTelegram: item.notify_telegram,
      })),
    };
    state.budgets.push(budget);
    return { budget: { id: budget.id } } as T;
  }

  const budgetMatch = pathname.match(/^\/api\/budgets\/([^/]+)$/);
  if (budgetMatch && method === "PATCH") {
    const budget = state.budgets.find((item) => item.id === budgetMatch[1]);
    if (!budget) throw new Error("Anggaran demo tidak ditemukan.");
    const input = parseBody<{
      monthly_limit: number;
      is_active: boolean;
      thresholds: Array<{
        percentage: number;
        notify_web: boolean;
        notify_telegram: boolean;
      }>;
    }>(options);
    budget.monthlyLimit = input.monthly_limit;
    budget.isActive = input.is_active;
    budget.thresholds = input.thresholds.map((item) => ({
      id: crypto.randomUUID(),
      percentage: item.percentage,
      notifyWeb: item.notify_web,
      notifyTelegram: item.notify_telegram,
    }));
    refreshBudgets();
    return { updated: true } as T;
  }

  if (pathname === "/api/reminders" && method === "POST") {
    const input = parseBody<{
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
    }>(options);
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      creatorUserId: currentUser.id,
      title: input.title,
      description: input.description ?? null,
      amount: input.amount ?? null,
      categoryId: input.category_id ?? null,
      recurrenceType: input.recurrence_type,
      intervalValue: input.interval_value ?? null,
      nextRunAt: input.next_run_at,
      timezone: "Asia/Jakarta",
      isActive: true,
      notifyWeb: input.notify_web,
      notifyTelegram: input.notify_telegram,
      recipientUserIds: input.recipient_user_ids,
    };
    state.reminders.push(reminder);
    return { reminder: { id: reminder.id } } as T;
  }

  const reminderMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderMatch && method === "PATCH") {
    const reminder = state.reminders.find(
      (item) => item.id === reminderMatch[1],
    );
    if (!reminder) throw new Error("Pengingat demo tidak ditemukan.");
    const input = parseBody<{
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
    }>(options);
    Object.assign(reminder, {
      title: input.title,
      description: input.description,
      amount: input.amount,
      categoryId: input.category_id,
      recurrenceType: input.recurrence_type,
      intervalValue: input.interval_value,
      nextRunAt: input.next_run_at,
      recipientUserIds: input.recipient_user_ids,
      notifyWeb: input.notify_web,
      notifyTelegram: input.notify_telegram,
      isActive: input.is_active,
    });
    return clone({ reminder }) as T;
  }

  demoUnavailable("Operasi ini");
}

export async function demoSendWithoutResponse(path: string, method: string) {
  const url = new URL(path, "https://demo.rangkumin.invalid");
  const notificationMatch = url.pathname.match(
    /^\/api\/notifications\/([^/]+)\/read$/,
  );
  if (notificationMatch && method === "PATCH") {
    const item = state.notifications.find(
      (entry) => entry.id === notificationMatch[1],
    );
    if (item) item.readAt = new Date().toISOString();
    return;
  }
  const transactionMatch = url.pathname.match(
    /^\/api\/transactions\/([^/]+)(?:\/(restore|purge))?$/,
  );
  if (transactionMatch) {
    const index = state.transactions.findIndex(
      (item) => item.id === transactionMatch[1],
    );
    if (index < 0) throw new Error("Transaksi demo tidak ditemukan.");
    if (transactionMatch[2] === "purge") state.transactions.splice(index, 1);
    else if (transactionMatch[2] === "restore") {
      state.transactions[index]!.deletedAt = null;
      state.transactions[index]!.purgeAfter = null;
    } else {
      const deletedAt = new Date();
      state.transactions[index]!.deletedAt = deletedAt.toISOString();
      state.transactions[index]!.purgeAfter = new Date(
        deletedAt.getTime() + 30 * 86_400_000,
      ).toISOString();
    }
    return;
  }
  if (url.pathname.startsWith("/api/push/subscriptions/")) return;
  demoUnavailable("Operasi ini");
}

function buildDemoDashboard() {
  return {
    user: clone(currentUser),
    summary: summary(),
    savings: savingsOverview(),
    transactions: listTransactions(
      new URL("https://demo.rangkumin.invalid/api/transactions?offset=0"),
    ).items.slice(0, 5),
    unread: state.notifications.filter((item) => !item.readAt).length,
    categories: clone(state.categories),
  };
}

export const demoDashboard = buildDemoDashboard();

export function getDemoDashboard() {
  return buildDemoDashboard();
}
