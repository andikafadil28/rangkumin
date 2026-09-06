import { deleteDB, openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { CreateTransactionInput } from "../api";

const DATABASE_NAME = "rangkumin-offline";
const DATABASE_VERSION = 1;

export type SnapshotRecord<T = unknown> = {
  key: string;
  userId: string;
  resource: string;
  data: T;
  syncedAt: string;
};

export type TransactionOutboxItem = {
  idempotencyKey: string;
  actorUserId: string;
  input: CreateTransactionInput;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  status: "pending" | "failed";
  lastError: string | null;
};

interface OfflineDatabase extends DBSchema {
  meta: {
    key: string;
    value: { key: string; value: string };
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: { "by-user": string };
  };
  transactionOutbox: {
    key: string;
    value: TransactionOutboxItem;
    indexes: { "by-actor": string; "by-status": string };
  };
}

let databasePromise: Promise<IDBPDatabase<OfflineDatabase>> | null = null;

function database() {
  databasePromise ??= openDB<OfflineDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      db.createObjectStore("meta", { keyPath: "key" });
      const snapshots = db.createObjectStore("snapshots", { keyPath: "key" });
      snapshots.createIndex("by-user", "userId");
      const outbox = db.createObjectStore("transactionOutbox", {
        keyPath: "idempotencyKey",
      });
      outbox.createIndex("by-actor", "actorUserId");
      outbox.createIndex("by-status", "status");
    },
  });
  return databasePromise;
}

function snapshotKey(userId: string, resource: string) {
  return `${userId}:${resource}`;
}

export async function rememberActiveUser(userId: string) {
  await (await database()).put("meta", { key: "active-user", value: userId });
}

export async function getRememberedUserId() {
  return (await (await database()).get("meta", "active-user"))?.value ?? null;
}

export async function saveSnapshot<T>(
  userId: string,
  resource: string,
  data: T,
) {
  const record: SnapshotRecord<T> = {
    key: snapshotKey(userId, resource),
    userId,
    resource,
    data,
    syncedAt: new Date().toISOString(),
  };
  const db = await database();
  await db.put("snapshots", record as SnapshotRecord);

  if (resource.startsWith("transactions:")) {
    const records = (await db.getAllFromIndex("snapshots", "by-user", userId))
      .filter((item) => item.resource.startsWith("transactions:"))
      .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt));
    await Promise.all(
      records.slice(20).map((item) => db.delete("snapshots", item.key)),
    );
  }
  return record;
}

export async function getSnapshot<T>(userId: string, resource: string) {
  return (await (
    await database()
  ).get("snapshots", snapshotKey(userId, resource))) as
    SnapshotRecord<T> | undefined;
}

export async function putOutboxItem(item: TransactionOutboxItem) {
  await (await database()).put("transactionOutbox", item);
}

export async function getOutboxItem(idempotencyKey: string) {
  return (await database()).get("transactionOutbox", idempotencyKey);
}

export async function getOutboxItems() {
  return (await database()).getAll("transactionOutbox");
}

export async function deleteOutboxItem(idempotencyKey: string) {
  await (await database()).delete("transactionOutbox", idempotencyKey);
}

export async function clearOfflineData() {
  const db = await database();
  const transaction = db.transaction(
    ["meta", "snapshots", "transactionOutbox"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("meta").clear(),
    transaction.objectStore("snapshots").clear(),
    transaction.objectStore("transactionOutbox").clear(),
    transaction.done,
  ]);
}

export async function resetOfflineDatabaseForTests() {
  if (databasePromise) (await databasePromise).close();
  databasePromise = null;
  await deleteDB(DATABASE_NAME);
}
