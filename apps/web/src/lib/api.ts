import { DashboardSnapshot, UserContext } from "../types";
import { loadDashboard, saveDashboard, loadContext, saveContext } from "./storage";

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
    // Server unreachable (e.g. GitHub Pages) — use localStorage
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
    // Server unreachable — persist locally
    const current = loadContext();
    const merged = { ...current, ...payload };
    saveContext(merged);
    return { context: merged };
  }
}
