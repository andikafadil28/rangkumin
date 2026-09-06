import {
  ApiError,
  AuthRequiredError,
  NetworkError,
  createTransaction,
  getIdentity,
} from "../api";
import type { CreateTransactionInput } from "../api";
import {
  clearOfflineData,
  deleteOutboxItem,
  getOutboxItem,
  getOutboxItems,
  putOutboxItem,
} from "./db";
import type { TransactionOutboxItem } from "./db";

export const OUTBOX_CHANGED_EVENT = "rangkumin:outbox-changed";
export const TRANSACTION_SYNCED_EVENT = "rangkumin:transaction-synced";

let activeDrain: Promise<SyncReport> | null = null;

type SyncReport = {
  synced: number;
  pending: number;
  failed: number;
  waitingForAccount: number;
  authRequired: boolean;
};

function announce(eventName = OUTBOX_CHANGED_EVENT) {
  window.dispatchEvent(new Event(eventName));
}

function retryAt(attempts: number) {
  const delay = Math.min(300_000, 2_000 * 2 ** Math.min(attempts, 7));
  return new Date(Date.now() + delay).toISOString();
}

function isRetryable(error: unknown) {
  return (
    error instanceof NetworkError ||
    (error instanceof ApiError &&
      (error.status >= 500 || [408, 425, 429].includes(error.status)))
  );
}

async function markRetry(item: TransactionOutboxItem, message: string) {
  const attempts = item.attempts + 1;
  await putOutboxItem({
    ...item,
    attempts,
    nextAttemptAt: retryAt(attempts),
    status: "pending",
    lastError: message,
  });
}

async function drain(): Promise<SyncReport> {
  const items = await getOutboxItems();
  const report: SyncReport = {
    synced: 0,
    pending: 0,
    failed: 0,
    waitingForAccount: 0,
    authRequired: false,
  };
  if (!items.length) return report;

  let currentUserId: string;
  try {
    currentUserId = (await getIdentity()).user.id;
  } catch (cause) {
    if (cause instanceof AuthRequiredError) report.authRequired = true;
    if (
      cause instanceof NetworkError ||
      cause instanceof AuthRequiredError ||
      cause instanceof TypeError
    ) {
      report.pending = items.filter((item) => item.status === "pending").length;
      report.failed = items.filter((item) => item.status === "failed").length;
      return report;
    }
    throw cause;
  }

  for (const item of items) {
    if (item.status === "failed") {
      report.failed += 1;
      continue;
    }
    if (item.actorUserId !== currentUserId) {
      report.waitingForAccount += 1;
      continue;
    }
    if (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > Date.now()) {
      report.pending += 1;
      continue;
    }

    try {
      await createTransaction(
        item.input,
        item.idempotencyKey,
        item.actorUserId,
      );
      await deleteOutboxItem(item.idempotencyKey);
      report.synced += 1;
      announce(TRANSACTION_SYNCED_EVENT);
    } catch (cause) {
      if (cause instanceof AuthRequiredError) {
        report.authRequired = true;
        report.pending += 1;
        break;
      }
      if (isRetryable(cause)) {
        await markRetry(
          item,
          cause instanceof Error ? cause.message : "Sinkronisasi tertunda.",
        );
        report.pending += 1;
        continue;
      }
      if (cause instanceof ApiError && cause.code === "Actor Mismatch") {
        report.waitingForAccount += 1;
        continue;
      }
      const message =
        cause instanceof Error ? cause.message : "Transaksi ditolak server.";
      await putOutboxItem({
        ...item,
        status: "failed",
        nextAttemptAt: null,
        lastError: message,
      });
      report.failed += 1;
    }
  }

  announce();
  return report;
}

export function syncTransactionOutbox() {
  activeDrain ??= drain().finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

export async function createOrQueueTransaction(
  actorUserId: string,
  input: CreateTransactionInput,
) {
  const idempotencyKey = crypto.randomUUID();
  try {
    await putOutboxItem({
      idempotencyKey,
      actorUserId,
      input,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: null,
      status: "pending",
      lastError: null,
    });
  } catch {
    if (!navigator.onLine) {
      throw new Error(
        "Browser tidak dapat menyimpan transaksi offline di perangkat ini.",
      );
    }
    await createTransaction(input, idempotencyKey, actorUserId);
    return { status: "synced" as const, idempotencyKey };
  }
  announce();

  const report = await syncTransactionOutbox();
  const remaining = await getOutboxItem(idempotencyKey);
  if (!remaining) return { status: "synced" as const, idempotencyKey };
  if (report.authRequired) {
    await deleteOutboxItem(idempotencyKey);
    announce();
    throw new AuthRequiredError();
  }
  if (remaining.status === "failed") {
    await deleteOutboxItem(idempotencyKey);
    announce();
    throw new Error(remaining.lastError ?? "Transaksi ditolak server.");
  }
  return { status: "queued" as const, idempotencyKey };
}

export async function retryFailedOutbox() {
  const items = await getOutboxItems();
  await Promise.all(
    items
      .filter((item) => item.status === "failed")
      .map((item) =>
        putOutboxItem({
          ...item,
          status: "pending",
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
        }),
      ),
  );
  announce();
  return syncTransactionOutbox();
}

export async function clearOfflineDataSafely() {
  if (activeDrain) await activeDrain.catch(() => undefined);
  await clearOfflineData();
  announce();
}
