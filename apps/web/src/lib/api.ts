import { DashboardSnapshot, NotificationPreferences, UserContext } from "../types";
import {
  loadContext,
  loadDashboard,
  loadNotificationPreferences,
  saveContext,
  saveDashboard,
  saveNotificationPreferences
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

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const response = await jsonOrThrow<{ preferences: NotificationPreferences }>("/api/notification-preferences");
    saveNotificationPreferences(response.preferences);
    return response.preferences;
  } catch {
    return loadNotificationPreferences();
  }
}

export async function updateNotificationPreferences(
  payload: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  try {
    const response = await jsonOrThrow<{ preferences: NotificationPreferences }>("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    saveNotificationPreferences(response.preferences);
    return response.preferences;
  } catch {
    const current = loadNotificationPreferences();
    const merged: NotificationPreferences = {
      ...current,
      ...payload,
      quietHours: {
        ...current.quietHours,
        ...(payload.quietHours ?? {})
      },
      categoryToggles: {
        ...current.categoryToggles,
        ...(payload.categoryToggles ?? {})
      }
    };
    saveNotificationPreferences(merged);
    return merged;
  }
}
