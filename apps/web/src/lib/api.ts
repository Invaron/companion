import { DashboardSnapshot, JournalEntry, JournalSyncPayload, UserContext } from "../types";
import {
  JournalQueueItem,
  loadContext,
  loadDashboard,
  loadJournalEntries,
  removeJournalQueueItem,
  saveContext,
  saveDashboard,
  saveJournalEntries
} from "./storage";

async function jsonOrThrow<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  try {
    const snapshot = await jsonOrThrow<DashboardSnapshot>("/api/dashboard");
    saveDashboard(snapshot);
    return snapshot;
  } catch {
    return loadDashboard();
  }
}

export async function updateContext(payload: Partial<UserContext>): Promise<{ context: UserContext }> {
  try {
    return await jsonOrThrow<{ context: UserContext }>("/api/context", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch {
    const current = loadContext();
    const merged = { ...current, ...payload };
    saveContext(merged);
    return { context: merged };
  }
}

export async function submitJournalEntry(content: string, clientEntryId: string): Promise<JournalEntry | null> {
  try {
    const response = await jsonOrThrow<{ entry: JournalEntry }>("/api/journal", {
      method: "POST",
      body: JSON.stringify({ content })
    });
    return response.entry;
  } catch {
    return null;
  }
}

export async function syncQueuedJournalEntries(queue: JournalQueueItem[]): Promise<number> {
  if (queue.length === 0) {
    return 0;
  }

  try {
    const payload: JournalSyncPayload[] = queue.map((item) => ({
      clientEntryId: item.clientEntryId,
      content: item.content,
      timestamp: item.timestamp,
      baseVersion: item.baseVersion
    }));

    const response = await jsonOrThrow<{ applied: Array<JournalEntry>; conflicts: Array<JournalEntry> }>(
      "/api/journal/sync",
      {
        method: "POST",
        body: JSON.stringify({ entries: payload })
      }
    );

    for (const entry of response.applied) {
      removeJournalQueueItem(entry.clientEntryId ?? "");
    }

    if (response.applied.length > 0) {
      const current = loadJournalEntries();
      const byClientId = new Map(current.map((entry) => [entry.clientEntryId, entry]));

      for (const applied of response.applied) {
        if (applied.clientEntryId) {
          byClientId.set(applied.clientEntryId, {
            ...applied,
            text: applied.content
          });
        }
      }

      saveJournalEntries(
        Array.from(byClientId.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      );
    }

    return response.applied.length;
  } catch {
    return 0;
  }
}
