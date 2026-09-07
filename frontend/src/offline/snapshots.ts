import { NetworkError, getDashboard } from "../api";
import {
  getRememberedUserId,
  getSnapshot,
  rememberActiveUser,
  saveSnapshot,
} from "./db";
import { DEMO_MODE } from "../demoMode";

export type SnapshotResult<T> = {
  data: T;
  syncedAt: string;
  stale: boolean;
};

function rethrowAbort(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
}

export async function loadDashboardSnapshot(
  signal?: AbortSignal,
  solo = false,
) {
  if (DEMO_MODE) {
    return {
      data: await getDashboard(signal, solo),
      syncedAt: new Date().toISOString(),
      stale: false,
    };
  }
  try {
    const data = await getDashboard(signal, solo);
    const syncedAt = new Date().toISOString();
    try {
      await rememberActiveUser(data.user.id);
      await saveSnapshot(data.user.id, "dashboard", data);
    } catch {
      // IndexedDB tidak boleh membuat request online yang sukses ikut gagal.
    }
    return { data, syncedAt, stale: false };
  } catch (cause) {
    rethrowAbort(cause);
    if (!(cause instanceof NetworkError)) throw cause;
    const snapshot = await (async () => {
      try {
        const userId = await getRememberedUserId();
        return userId
          ? getSnapshot<Awaited<ReturnType<typeof getDashboard>>>(
              userId,
              "dashboard",
            )
          : undefined;
      } catch {
        throw cause;
      }
    })();
    if (!snapshot) throw cause;
    return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale: true };
  }
}

export async function loadWithSnapshot<T>(
  userId: string,
  resource: string,
  loader: () => Promise<T>,
): Promise<SnapshotResult<T>> {
  if (DEMO_MODE) {
    return {
      data: await loader(),
      syncedAt: new Date().toISOString(),
      stale: false,
    };
  }
  try {
    const data = await loader();
    const syncedAt = new Date().toISOString();
    try {
      await saveSnapshot(userId, resource, data);
    } catch {
      // Snapshot bersifat best-effort ketika API tersedia.
    }
    return { data, syncedAt, stale: false };
  } catch (cause) {
    rethrowAbort(cause);
    if (!(cause instanceof NetworkError)) throw cause;
    let snapshot;
    try {
      snapshot = await getSnapshot<T>(userId, resource);
    } catch {
      throw cause;
    }
    if (!snapshot) throw cause;
    return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale: true };
  }
}
