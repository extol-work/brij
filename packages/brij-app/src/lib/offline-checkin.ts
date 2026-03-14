const DB_NAME = "brij-offline";
const STORE_NAME = "pending-checkins";
const DB_VERSION = 1;

export interface PendingCheckin {
  id: string;
  code: string;
  body: { guestName?: string; checkin?: boolean };
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCheckinOffline(code: string, body: PendingCheckin["body"]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({
    id: crypto.randomUUID(),
    code,
    body,
    createdAt: new Date().toISOString(),
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCheckins(): Promise<PendingCheckin[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const req = tx.objectStore(STORE_NAME).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingCheckin(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncPendingCheckins(): Promise<number> {
  const pending = await getPendingCheckins();
  let synced = 0;
  for (const item of pending) {
    try {
      const res = await fetch(`/api/checkin/${item.code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.ok || res.status === 400) {
        // 400 = already checked in or invalid — either way, remove from queue
        await removePendingCheckin(item.id);
        synced++;
      }
    } catch {
      // Still offline, stop trying
      break;
    }
  }
  return synced;
}
